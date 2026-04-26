from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from routes.auth import get_current_user
from database import student_logs, predictions, interventions
from ml_service import calculate_effort_score, predict_risk_for_subject
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json
import google.generativeai as genai
import statistics
import os
import shutil
import joblib
from import_csv_to_mongo import import_csv_to_mongo, check_existing_data

router = APIRouter()


def _run_sync_predictions():
    """
    Chạy dự đoán cho toàn bộ sinh viên trong student_logs và lưu vào predictions.
    Sử dụng subject-based models (một model cho mỗi môn).
    - Yêu cầu: student record phải có 'subject_id' hoặc 'course_name' để xác định model.
    - Nếu không có subject_id, sẽ bỏ qua sinh viên đó.
    """
    print("\n🔄 [_run_sync_predictions] Bắt đầu chạy dự đoán tự động...")
    students = list(student_logs.find())
    print(f"📊 Tổng sinh viên trong student_logs: {len(students)}")
    
    if not students:
        print("❌ Không có sinh viên để dự đoán!")
        return 0

    docs = []
    skipped = 0
    errors = 0
    
    for stu in students:
        student_id = stu.get('student_id', '?')
        
        # Kiểm tra weekly_data
        if "weekly_data" not in stu or not stu["weekly_data"]:
            print(f"⏭️  [{student_id}] Bỏ qua: không có weekly_data")
            skipped += 1
            continue
        
        # Lấy subject_id từ course_name (nếu không có)
        subject_id = stu.get("subject_id")
        course_name = stu.get("course_name", "N/A")
        
        if not subject_id:
            # Fallback: tạo subject_id từ course_name
            if course_name and course_name != "N/A":
                subject_id = course_name.lower().replace(" ", "_")
                print(f"⚠️  [{student_id}] Không có subject_id, dùng fallback: {subject_id} (từ '{course_name}')")
            else:
                print(f"❌ [{student_id}] Bỏ qua: không có subject_id hoặc course_name")
                skipped += 1
                continue
        
        print(f"🎯 [{student_id}] Dự đoán cho môn: {subject_id}, khóa học: {course_name}")
        
        weekly_data = stu["weekly_data"]
        try:
            # Dự đoán rủi ro
            result = predict_risk_for_subject(subject_id, weekly_data)
            
            # Kiểm tra nếu model không tồn tại
            if "error" in result:
                print(f"  ❌ Lỗi dự đoán: {result['error']}")
                errors += 1
                # Thay vì bỏ qua, lưu trạng thái lỗi để UI có thể hiển thị
                result = {
                    "risk_probability": 0.0,
                    "risk_label": "Lỗi model (Chưa có dự đoán)",
                    "model_version": "N/A",
                    "threshold": 0.5
                }
            
            # Tính effort_score
            effort_score = calculate_effort_score(weekly_data)
            week_nums = [w.get("week") for w in weekly_data if w.get("week")]
            latest_week = max(week_nums) if week_nums else 1
            
            print(f"  ✅ Dự đoán: {result.get('risk_label', 'N/A')} (xác suất: {result.get('risk_probability', 0):.2%})")
            
            # Upsert into predictions collection
            filter_query = {
                "student_id":   student_id,
                "course_name":  course_name,
                "subject_id":   subject_id,
                "class_name":   stu.get("class_name", "N/A")
            }
            
            pred_doc = {
                "student_id":       student_id,
                "course_name":      course_name,
                "subject_id":       subject_id,
                "class_name":       stu.get("class_name", "N/A"),
                "week":             latest_week,
                "risk_probability": result["risk_probability"],
                "risk_label":       result["risk_label"],
                "effort_score":     effort_score,
                "model_version":    result.get("model_version", "N/A"),
                "threshold":        result.get("threshold", 0.5),
                "updated_at":       datetime.now()
            }
            
            predictions.update_one(filter_query, {"$set": pred_doc}, upsert=True)
            docs.append(pred_doc)
            
        except Exception as e:
            print(f"  ❌ Exception: {type(e).__name__}: {e}")
            errors += 1

    print(f"\n📈 Kết quả dự đoán: {len(docs)} thành công, {skipped} bỏ qua, {errors} lỗi")
    return len(docs)

# Schema For AI Request
class AIExplainRequest(BaseModel):
    api_key: str
    student_data: dict

class AIEmailRequest(BaseModel):
    api_key: str
    student_data: dict
    intervention_type: str
    note: str

# Schema for new intervention
class InterventionCreate(BaseModel):
    student_id: str
    course_name: str
    intervention_type: str
    note: str

# Schema for incoming learning behavior data mapping
# 9 metrics đúng theo model logistic_regression.py
class BehaviorData(BaseModel):
    student_id: str
    subject_id: str                         # ⚠️ REQUIRED: ID của môn học
    week: int
    active_days: int
    login_count: int
    video_views: int
    document_reads: int
    discussion: int
    assignment_duration_mins: float = 0.0   # Thời gian làm bài (phút)
    ontime_margin: float = 0.0              # Biên nộp đúng hạn (+ = sớm, - = trễ)
    days_since_last_login: int = 0          # Số ngày kể từ lần đăng nhập cuối
    session_duration: float = 0.0          # Thời lượng phiên học (phút)
    weekly_score: Optional[float] = None   # Điểm tuần (chỉ lưu, không dùng làm feature)

from bson import ObjectId

def serialize_doc(doc):
    if isinstance(doc, list):
        return [serialize_doc(i) for i in doc]
    elif isinstance(doc, dict):
        return {k: serialize_doc(v) for k, v in doc.items()}
    elif isinstance(doc, ObjectId):
        return str(doc)
    return doc

# 1. Danh sách sinh viên
@router.get("/students")
def get_students(
    course: Optional[str] = None, 
    class_name: Optional[str] = None, 
    risk_label: Optional[str] = None, 
    min_risk: Optional[float] = None, 
    max_risk: Optional[float] = None, 
    current_user: dict = Depends(get_current_user)
):
    # 1. Tìm danh sách sinh viên cơ bản
    query = {}
    if course: query["course_name"] = course
    if class_name: query["class_name"] = class_name
    
    students_cursor = student_logs.find(query, {"weekly_data": 0}).sort("full_name", 1)
    students_raw = [serialize_doc(doc) for doc in students_cursor]
    
    if not students_raw:
        return []

    # 2. Deduplication: nếu KHÔNG lọc theo môn cụ thể, mỗi student_id chỉ giữ 1 bản ghi
    # (ưu tiên bản ghi có course_name). Nếu lọc theo môn thì giữ tất cả.
    if not course:
        seen_ids = set()
        students_list = []
        for s in students_raw:
            sid = s.get("student_id")
            if sid not in seen_ids:
                seen_ids.add(sid)
                students_list.append(s)
    else:
        students_list = students_raw

    # 3. Lấy danh sách composite keys (student_id + course_name)
    student_ids = [s["student_id"] for s in students_list]
    
    # 4. Lấy kết quả dự báo mới nhất theo (student_id, course_name)
    # Sort trước khi group để luôn lấy đúng bản ghi mới nhất.
    latest_pred_pipeline = [
        {"$match": {"student_id": {"$in": student_ids}}},
        {
            "$sort": {
                "student_id": 1,
                "course_name": 1,
                "week": -1,
                "updated_at": -1,
            }
        },
        {
            "$group": {
                "_id": {
                    "student_id": "$student_id",
                    "course_name": {"$ifNull": ["$course_name", ""]},
                },
                "latest": {"$first": "$$ROOT"},
            }
        },
    ]
    latest_preds = list(predictions.aggregate(latest_pred_pipeline))

    preds_map = {}
    for p in latest_preds:
        student_key = p["_id"]["student_id"]
        course_key = p["_id"]["course_name"]
        key = f"{student_key}|{course_key}"
        preds_map[key] = serialize_doc(p["latest"])

    # 4.5. Lấy số lần can thiệp của từng sinh viên (batch)
    inv_pipeline = [
        {"$match": {"student_id": {"$in": student_ids}}},
        {"$group": {"_id": "$student_id", "count": {"$sum": 1}}}
    ]
    inv_counts = {doc["_id"]: doc["count"] for doc in interventions.aggregate(inv_pipeline)}

    # 5. Ghép dữ liệu dự đoán và lọc
    final_list = []
    for s in students_list:
        key = f"{s.get('student_id', '')}|{s.get('course_name', '')}"
        pred = preds_map.get(key)
        s["latest_prediction"] = pred
        
        # Gắn thông tin can thiệp
        inv_count = inv_counts.get(s.get("student_id", ""), 0)
        s["intervention_count"] = inv_count
        s["has_intervention"] = inv_count > 0
        
        # 6. Lọc theo Risk Label
        keep = True
        if risk_label and risk_label != "all":
            current_risk = pred.get("risk_label") if pred else None
            if risk_label == "Chưa dự đoán":
                if current_risk is not None:
                    keep = False
            elif current_risk != risk_label:
                keep = False
        
        # 7. Lọc theo Risk Probability (%)
        if keep and pred:
            prob = pred.get("risk_probability", 0.0)
            if min_risk is not None and prob < min_risk:
                keep = False
            if max_risk is not None and prob > max_risk:
                keep = False
        elif keep and (min_risk is not None or max_risk is not None):
            # Nếu có filter % mà student chưa có dự đoán -> bỏ qua
            keep = False

        if keep:
            final_list.append(s)
            
    return final_list



# 2. Chi tiết sinh viên + dữ liệu logs theo tuần
@router.get("/students/{student_id}")
def get_student_details(student_id: str, course_name: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"student_id": student_id}
    if course_name:
        query["course_name"] = course_name
        
    student = student_logs.find_one(query)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    # Lấy các lịch sử dự đoán cho môn học này
    pred_history = list(predictions.find({
        "student_id": student_id, 
        "course_name": student.get("course_name")
    }).sort("week", -1))
    
    # Lấy lịch sử can thiệp
    interventions_hist = list(interventions.find({
        "student_id": student_id,
        "course_name": student.get("course_name")
    }).sort("date", -1))
    
    # Dữ liệu dự đoán đã có sẵn risk_probability và risk_label    
    return {
        "profile": serialize_doc(student),
        "predictions": [serialize_doc(p) for p in pred_history],
        "interventions": [serialize_doc(i) for i in interventions_hist]
    }

# 3. Thống kê dashboard
@router.get("/dashboard/summary")
def get_dashboard_summary(course: Optional[str] = None, class_name: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    student_query = {}
    if course: student_query["course_name"] = course
    if class_name: student_query["class_name"] = class_name
    
    student_ids = None
    if student_query:
        matched_students = list(student_logs.find(student_query, {"student_id": 1}))
        student_ids = [s["student_id"] for s in matched_students]
        total_students = len(student_ids)
    else:
        total_students = student_logs.count_documents({})
        
    pred_match = {}
    if student_ids is not None:
        pred_match["student_id"] = {"$in": student_ids}
    if course:
        pred_match["course_name"] = course
        
    pipeline = [{"$sort": {"student_id": 1, "week": -1}}]
    if pred_match:
        pipeline.insert(0, {"$match": pred_match})
        
    pipeline.append({
        "$group": {
            "_id": "$student_id",
            "risk_label": {"$first": "$risk_label"},
            "risk_probability": {"$first": "$risk_probability"},
            "model_probs": {"$first": "$model_probs"}
        }
    })
    
    latest_preds = list(predictions.aggregate(pipeline))
    
    risk_count: int = 0
    for p in latest_preds:
        label = p.get("risk_label", "An toàn")
        if label == "Nguy cơ":
            risk_count = risk_count + 1
            
    safe_count = total_students - risk_count
    
    risk_percentage = 0.0
    if total_students > 0:
         risk_percentage = round(float(risk_count) / float(total_students) * 100.0, 1)

    return {
        "total_students": total_students,
        "safe_students": safe_count,
        "risk_students": risk_count,
        "risk_percentage": risk_percentage
    }

# 3.5. Lấy danh sách bộ lọc Môn/Lớp
@router.get("/dashboard/filters")
def get_dashboard_filters(current_user: dict = Depends(get_current_user)):
    pipeline = [
        {
            "$group": {
                "_id": "$course_name",
                "classes": {"$addToSet": "$class_name"}
            }
        }
    ]
    results = list(student_logs.aggregate(pipeline))
    filters = {}
    for r in results:
        if r["_id"]:
            valid_classes = [c for c in r["classes"] if c]
            filters[r["_id"]] = sorted(valid_classes)
    return filters

# 3.6. Dữ liệu xu hướng tỷ lệ rủi ro theo tuần
@router.get("/dashboard/trend")
def get_dashboard_trend(course: Optional[str] = None, class_name: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    student_query = {}
    if course: student_query["course_name"] = course
    if class_name: student_query["class_name"] = class_name
    
    students = list(student_logs.find(student_query, {"weekly_data": 1}))
    if not students:
        return {"weeks": [], "trend": []}
        
    selected_model = current_user.get("selectedModel", "Ensemble")
    week_stats = {}
    
    max_week = 0
    for stu in students:
        if "weekly_data" not in stu: continue
        weekly_data = stu["weekly_data"]
        
        for w in weekly_data:
            wk = w.get("week")
            if wk is None: continue
            
            max_week = max(max_week, wk)
            if wk not in week_stats:
                week_stats[wk] = {"total": 0, "effort_sum": 0.0}
            
            # Tính điểm nỗ lực riêng cho tuần này
            effort = calculate_effort_score([w])
            
            week_stats[wk]["total"] += 1
            week_stats[wk]["effort_sum"] += effort

    weeks = []
    trend = []
    
    for i in range(1, max_week + 1):
        if i in week_stats and week_stats[i]["total"] > 0:
            weeks.append(f"Tuần {i}")
            avg_effort = round(week_stats[i]["effort_sum"] / week_stats[i]["total"], 1)
            trend.append(avg_effort)
            
    return {"weeks": weeks, "trend": trend}

# 4. Danh sách cảnh báo sớm
@router.get("/early-warning")
def get_early_warning(course: Optional[str] = None, class_name: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    student_query = {}
    if course: student_query["course_name"] = course
    if class_name: student_query["class_name"] = class_name
    
    student_ids = None
    if student_query:
        matched_students = list(student_logs.find(student_query, {"student_id": 1}))
        student_ids = [s["student_id"] for s in matched_students]
    
    pipeline = [{"$sort": {"student_id": 1, "week": -1}}]
    
    if student_ids is not None:
        pipeline.insert(0, {"$match": {"student_id": {"$in": student_ids}}})
        
    pipeline.append({
            "$group": {
                "_id": "$student_id",
                "risk_label": {"$first": "$risk_label"},
                "risk_probability": {"$first": "$risk_probability"},
                "model_probs": {"$first": "$model_probs"},
                "effort_score": {"$first": "$effort_score"}
            }
        })
    all_latest = list(predictions.aggregate(pipeline))
    selected_model = current_user.get("selectedModel", "Ensemble")
    
    # Filter risky first
    risky_ids = []
    risky_probs = {}
    risky_efforts = {}
    for p in all_latest:
        prob = p.get("risk_probability", 0.0)
        label = p.get("risk_label", "An toàn")
        if label == "Nguy cơ":
            rid = p["_id"]
            risky_ids.append(rid)
            risky_probs[rid] = prob
            risky_efforts[rid] = p.get("effort_score", 0)
            
    # Batch fetch student metadata
    students_meta = {s["student_id"]: s for s in student_logs.find({"student_id": {"$in": risky_ids}}, {"weekly_data": 0})}
    
    # Batch fetch intervention counts
    inv_pipeline_ew = [
        {"$match": {"student_id": {"$in": risky_ids}}},
        {"$group": {"_id": "$student_id", "count": {"$sum": 1}}}
    ]
    inv_counts_ew = {doc["_id"]: doc["count"] for doc in interventions.aggregate(inv_pipeline_ew)}
    
    risky_students = []
    for rid in risky_ids:
        stu = students_meta.get(rid)
        inv_count = inv_counts_ew.get(rid, 0)
        risky_students.append({
            "student_id": rid,
            "student_name": stu["full_name"] if stu else "Unknown",
            "class_name": stu["class_name"] if stu else "Unknown",
            "course_name": stu["course_name"] if stu else "Unknown",
            "risk_probability": risky_probs[rid],
            "risk_label": "Nguy cơ",
            "effort_score": risky_efforts[rid],
            "intervention_count": inv_count,
            "has_intervention": inv_count > 0
        })
            
    return risky_students

# 4.5. Lấy danh sách sinh viên theo nhóm rủi ro (cho modal dashboard)
@router.get("/dashboard/students_by_risk")
def get_students_by_risk(risk_label: str, course: Optional[str] = None, class_name: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    student_query = {}
    if course: student_query["course_name"] = course
    if class_name: student_query["class_name"] = class_name
    
    student_ids = None
    if student_query:
        matched_students = list(student_logs.find(student_query, {"student_id": 1}))
        student_ids = [s["student_id"] for s in matched_students]
    
    pipeline = [{"$sort": {"student_id": 1, "week": -1}}]
    
    if student_ids is not None:
        pipeline.insert(0, {"$match": {"student_id": {"$in": student_ids}}})
        
    pipeline.append({
        "$group": {
            "_id": "$student_id",
            "risk_label": {"$first": "$risk_label"},
            "risk_probability": {"$first": "$risk_probability"},
            "model_probs": {"$first": "$model_probs"},
            "effort_score": {"$first": "$effort_score"}
        }
    })
    
    all_latest = list(predictions.aggregate(pipeline))
    selected_model = current_user.get("selectedModel", "Ensemble")
    
    matching_ids = []
    id_probs = {}
    id_efforts = {}
    for p in all_latest:
        prob = p.get("risk_probability", 0.0)
        label = p.get("risk_label", "An toàn")
        if label == risk_label:
            rid = p["_id"]
            matching_ids.append(rid)
            id_probs[rid] = prob
            id_efforts[rid] = p.get("effort_score", 0)
            
    # Batch fetch
    students_meta = {s["student_id"]: s for s in student_logs.find({"student_id": {"$in": matching_ids}}, {"weekly_data": 0})}
    
    result_students = []
    for rid in matching_ids:
        stu = students_meta.get(rid)
        result_students.append({
            "student_id": rid,
            "student_name": stu["full_name"] if stu else "Unknown",
            "class_name": stu["class_name"] if stu else "Unknown",
            "course_name": stu["course_name"] if stu else "Unknown",
            "risk_probability": id_probs[rid],
            "risk_label": risk_label,
            "effort_score": id_efforts[rid]
        })
            
    return result_students

# 5. API dự đoán sinh viên nguy cơ - Subject-based (require subject_id)
@router.post("/predict")
def predict_student_risk(data: BehaviorData, current_user: dict = Depends(get_current_user)):
    """
    Dự đoán rủi ro cho một sinh viên theo môn học cụ thể.
    
    Yêu cần:
    - subject_id: ID của môn học (ví dụ: "math", "english")
    - weekly_data chua đủ 9 metrics cho 3 tuần (W1-W3)
    
    Trả về:
    - risk_probability, risk_label từ model của môn học
    - effort_score từ feature importance
    - model_version, accuracy, threshold
    """
    # Lấy dữ liệu sinh viên từ DB để có đủ weekly_data W1-W3
    student = student_logs.find_one({"student_id": data.student_id})
    
    if student and "weekly_data" in student:
        # Dùng weekly_data từ DB (đã có W1-W3)
        weekly_data = student["weekly_data"]
    else:
        # Fallback: bọc data hiện tại thành danh sách tuần
        d = data.dict()
        weekly_data = [{
            "week":                     d.get("week", 1),
            "active_days":              d.get("active_days", 0),
            "login_count":              d.get("login_count", 0),
            "online_count":             d.get("login_count", 0),  # alias tương thích
            "video_views":              d.get("video_views", 0),
            "document_reads":           d.get("document_reads", 0),
            "discussion":               d.get("discussion", 0),
            "assignment_duration_mins": d.get("assignment_duration_mins", 0.0),
            "ontime_margin":            d.get("ontime_margin", 0.0),
            "days_since_last_login":    d.get("days_since_last_login", 0),
            "session_duration":         d.get("session_duration", 0.0),
            "weekly_score":             d.get("weekly_score") or 0.0,
        }]
    
    # Dự đoán theo subject-based model
    pred_result = predict_risk_for_subject(data.subject_id, weekly_data)
    
    # Kiểm tra lỗi từ model
    if "error" in pred_result:
        raise HTTPException(status_code=404, detail=f"Model không tồn tại cho môn '{data.subject_id}': {pred_result['error']}")
    
    # Tính effort score
    effort_score = calculate_effort_score(weekly_data)
    
    doc = {
        "student_id":       data.student_id,
        "subject_id":       data.subject_id,
        "course_name":      student.get("course_name", "N/A") if student else "N/A",
        "class_name":       student.get("class_name", "N/A") if student else "N/A",
        "week":             data.week,
        "risk_probability": pred_result["risk_probability"],
        "risk_label":       pred_result["risk_label"],
        "effort_score":     effort_score,
        "threshold":        pred_result.get("threshold", 0.5),
        "model_version":    pred_result.get("model_version", "N/A"),
        "accuracy":         pred_result.get("accuracy", 0),
        "updated_at":       datetime.now(),
    }
    
    # Lưu kết quả dự đoán vào MongoDB
    predictions.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    
    return doc

# 6. Dữ liệu biểu đồ phát hiện bất thường Scatter
@router.get("/integrity")
def get_integrity_data(course: Optional[str] = None, class_name: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    student_query = {}
    if course: student_query["course_name"] = course
    if class_name: student_query["class_name"] = class_name
    
    student_ids = None
    if student_query:
        matched = list(student_logs.find(student_query, {"student_id": 1}))
        student_ids = [s["student_id"] for s in matched]
        if not student_ids:
            return []

    pipeline = [{"$sort": {"week": -1}}]
    if student_ids is not None:
        pipeline.insert(0, {"$match": {"student_id": {"$in": student_ids}}})
        
    pipeline.append({
        "$group": {
            "_id": "$student_id",
            "effort_score": {"$first": "$effort_score"},
            "week": {"$first": "$week"},
            "risk_label": {"$first": "$risk_label"},
            "risk_probability": {"$first": "$risk_probability"},
            "model_probs": {"$first": "$model_probs"}
        }
    })
    latest_efforts = list(predictions.aggregate(pipeline))
    
    stu_ids = [e["_id"] for e in latest_efforts]
    # Batch fetch students including their weekly_data for scoring
    students_meta = {s["student_id"]: s for s in student_logs.find({"student_id": {"$in": stu_ids}})}
    
    scatter_data = []
    selected_model = current_user.get("selectedModel", "Ensemble")
    
    # Pass 1: Gather raw data to compute population statistics
    valid_efforts = []
    valid_scores = []
    valid_logins = []
    raw_dat = []
    
    for eff in latest_efforts:
        s_id = eff["_id"]
        week = eff["week"]
        student = students_meta.get(s_id)
        
        if student and "weekly_data" in student:
            week_log = next((w for w in student["weekly_data"] if w["week"] == week), None)
            if week_log:
                effort = eff["effort_score"]
                score = week_log.get("weekly_score", 0)
                login = week_log.get("login_count", 0)
                active_days = week_log.get("active_days", 0)
                
                valid_efforts.append(effort)
                valid_scores.append(score)
                valid_logins.append(login)
                
                raw_dat.append({
                    "s_id": s_id,
                    "student": student,
                    "week_log": week_log,
                    "effort": effort,
                    "score": score,
                    "login": login,
                    "active_days": active_days,
                    "eff_obj": eff
                })
                
    # Tính trung bình để làm ngưỡng phân vùng quadrant
    mean_effort = statistics.mean(valid_efforts) if len(valid_efforts) > 0 else 5.0
    mean_score  = statistics.mean(valid_scores)  if len(valid_scores)  > 0 else 5.0

    # Pass 2: Phân loại quadrant-based (4 vùng cố định)
    # Mỗi sinh viên rơi vào đúng 1 trong 4 nhóm dựa trên effort & score so với trung bình lớp
    for item in raw_dat:
        high_effort = item["effort"] >= mean_effort
        high_score  = item["score"]  >= mean_score

        if not high_effort and high_score:
            # Q1: Nỗ lực thấp, điểm cao → Nghi vấn gian lận
            anomaly_type = "Nghi vấn gian lận"
            reason = "Hoạt động học tập trên hệ thống thấp hơn trung bình lớp nhưng điểm số lại cao bất thường."
            risk_level = "Cao"

        elif high_effort and high_score:
            # Q2: Nỗ lực cao, điểm cao → Học tốt
            anomaly_type = "Học tốt"
            reason = "Nỗ lực học tập và điểm số đều vượt mức trung bình lớp."
            risk_level = "Thấp"

        elif not high_effort and not high_score:
            # Q3: Nỗ lực thấp, điểm thấp → Thiếu nỗ lực
            anomaly_type = "Thiếu nỗ lực"
            reason = "Cả hoạt động học tập lẫn điểm số đều dưới mức trung bình lớp — cần nhắc nhở, động viên."
            risk_level = "Trung bình"

        else:
            # Q4: Nỗ lực cao, điểm thấp → Nguy cơ kiệt sức
            anomaly_type = "Nguy cơ kiệt sức"
            reason = "Đầu tư nhiều thời gian và nỗ lực nhưng kết quả vẫn dưới mức trung bình — cần hỗ trợ phương pháp học."
            risk_level = "Cao"

        # Gắn thêm thông tin ML Risk
        eff_obj  = item["eff_obj"]
        ml_prob  = eff_obj.get("risk_probability", 0.0)
        ml_label = eff_obj.get("risk_label", "An toàn")

        scatter_data.append({
            "student_id":   item["s_id"],
            "student_name": item["student"].get("full_name", "Unknown"),
            "class_name":   item["student"].get("class_name", "Unknown"),
            "course_name":  item["student"].get("course_name", "Unknown"),
            "effort_score": item["effort"],
            "score":        item["score"],
            "anomaly_type": anomaly_type,
            "reason":       reason,
            "risk_level":   risk_level,
            "ml_risk_label": ml_label,
            "ml_risk_prob":  ml_prob,
            "details":       item["week_log"],
            # Truyền mean để frontend vẽ đường tham chiếu chính xác
            "mean_effort":  round(mean_effort, 2),
            "mean_score":   round(mean_score, 2)
        })

    return scatter_data

# 7. Quản lý can thiệp
@router.post("/intervention")
def add_intervention(inv: InterventionCreate, current_user: dict = Depends(get_current_user)):
    doc = {
        "student_id": inv.student_id,
        "course_name": inv.course_name,
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "intervention_type": inv.intervention_type,
        "note": inv.note,
        "created_by": current_user["email"]
    }
    result = interventions.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc

@router.get("/interventions")
def get_interventions(course: Optional[str] = None, class_name: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    student_query = {}
    if course: student_query["course_name"] = course
    if class_name: student_query["class_name"] = class_name
    
    student_ids = None
    if student_query:
        matched = list(student_logs.find(student_query, {"student_id": 1}))
        student_ids = [s["student_id"] for s in matched]
        
    q = {}
    if student_ids is not None:
        q["student_id"] = {"$in": student_ids}
    if course:
        q["course_name"] = course
        
    inv_list = list(interventions.find(q).sort("date", -1))
    
    if inv_list:
        stu_ids = list(set([i["student_id"] for i in inv_list]))
        students_meta = {s["student_id"]: s for s in student_logs.find({"student_id": {"$in": stu_ids}}, {"full_name": 1, "student_id": 1})}
        
        for inv in inv_list:
            stu = students_meta.get(inv["student_id"])
            inv["student_name"] = stu["full_name"] if stu else "Unknown"
        
    return serialize_doc(inv_list)

@router.get("/ml/metrics")
def get_model_metrics():
    """Trả về danh sách các model có sẵn cho từng môn học (subject-based)."""
    try:
        from ml_service import get_available_subjects
        subjects = get_available_subjects()
        return {
            "total_models": len(subjects),
            "subjects": subjects,
            "prediction_type": "subject-based",
            "description": "Hệ thống dự đoán rủi ro sử dụng model riêng cho mỗi môn học (subject)"
        }
    except Exception as e:
        return {
            "error": str(e),
            "total_models": 0,
            "subjects": []
        }

# 8. Giải thích AI
def load_subject_metadata(subject_id: str):
    """Lấy insights (feature importances) từ file config của mô hình"""
    try:
        from model_manager import get_model_manager
        manager = get_model_manager()
        model, scaler, config, metadata = manager.load_model(subject_id)
        if config:
            return config
    except Exception as e:
        print(f"Lỗi khi load metadata AI: {e}")
    return {}

def translate_feature_name(feature: str) -> str:
    mapping = {
        "active_days": "Số ngày hoạt động",
        "login_count": "Số lượt đăng nhập",
        "online_count": "Số lượt đăng nhập",
        "video_views": "Số lượt xem video",
        "document_reads": "Số lượt đọc tài liệu",
        "discussion": "Tham gia thảo luận",
        "assignment_duration_mins": "Thời gian làm bài tập (phút)",
        "ontime_margin": "Thời gian nộp bài đúng hạn",
        "days_since_last_login": "Số ngày từ lần đăng nhập cuối",
        "session_duration": "Thời lượng mỗi phiên học (phút)",
    }
    
    for k, v in mapping.items():
        if feature.startswith(k):
            suffix = feature[len(k):]
            if suffix == "_w1":
                return f"{v} (Tuần 1)"
            elif suffix == "_w2":
                return f"{v} (Tuần 2)"
            elif suffix == "_w3":
                return f"{v} (Tuần 3)"
            else:
                return v
    return feature

def build_ai_prompt(student_data: dict, insights: dict, course_name: str):
    """Xây dựng prompt với định hướng rủi ro từ insights học máy"""
    # top_risk_increase: Các yếu tố đẩy sinh viên vào rủi ro (Trọng số DƯƠNG)
    # top_risk_decrease: Các yếu tố kéo sinh viên về an toàn (Trọng số ÂM)
    risk_factors = insights.get('top_risk_increase', [])
    safe_factors = insights.get('top_risk_decrease', [])
    
    risk_text = ", ".join([f"{translate_feature_name(i['feature'])} (Trọng số: {i.get('Weight', i.get('weight', 0)):.2f})" for i in risk_factors]) if risk_factors else "Không có do thiếu file đánh giá insights"
    safe_text = ", ".join([f"{translate_feature_name(i['feature'])} (Trọng số: {i.get('Weight', i.get('weight', 0)):.2f})" for i in safe_factors]) if safe_factors else "Không có do thiếu file đánh giá insights"

    pred = student_data.get("prediction") or {}
    pred_label = pred.get("risk_label", "Chưa rõ")
    pred_prob = pred.get("risk_probability", 0) * 100

    prompt = f"""
    Bạn là chuyên gia phân tích dữ liệu học tập cho môn: {course_name}.
    Dựa trên huấn luyện máy học thực tế, mô hình cho môn này có những đặc trưng sau:
    - Các hành vi làm TĂNG NGUY CƠ RỚT MÔN (trọng số DƯƠNG): {risk_text}
    - Các hành vi giúp AN TOÀN, QUA MÔN (trọng số ÂM): {safe_text}

    KẾT QUẢ DỰ ĐOÁN TỪ MÔ HÌNH HỌC MÁY:
    Mô hình đã phân loại sinh viên này vào nhóm: **{pred_label}** với xác suất rủi ro là {pred_prob:.1f}%.
    Lưu ý: Bạn PHẢI giải thích DỰA TRÊN KẾT QUẢ NÀY. Nếu mô hình dự đoán là 'Nguy cơ', hãy chỉ ra số liệu nào trong logs trùng khớp với đặc trưng rủi ro. Nếu 'An toàn', hãy giải thích các điểm tích cực. Tuyệt đối không đưa ra đánh giá trái ngược với kết luận của mô hình học máy.

    DỮ LIỆU SINH VIÊN TÓM TẮT:
    {json.dumps(student_data, ensure_ascii=False, indent=2)}

    YÊU CẦU ĐẦU RA (RẤT QUAN TRỌNG):
    - Trình bày CỰC KỲ NGẮN GỌN (tối đa 4-5 câu).
    - Tập trung thẳng vào vấn đề chính khiến sinh viên gặp rủi ro (hoặc an toàn).
    - Đưa ra 1-2 gạch đầu dòng hành động thực tế cho giảng viên.
    - Tuyệt đối KHÔNG viết dài dòng lê thê, KHÔNG lặp lại toàn bộ số liệu.
    - Ngôn ngữ chuyên nghiệp, dễ hiểu.
    """
    return prompt

@router.post("/ai/explain")
def explain_with_ai(req: AIExplainRequest, current_user: dict = Depends(get_current_user)):
    try:
        genai.configure(api_key=req.api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # 1. Trích xuất course_name và subject_id
        course_name = req.student_data.get("course", "Không xác định")
        subject_id = req.student_data.get("subject_id", course_name)
        
        # 2. Lấy trọng số mô hình từ file config bằng subject_id
        insights = load_subject_metadata(subject_id)
        
        # 3. Tạo prompt chuyên sâu và gọi Gemini
        prompt = build_ai_prompt(req.student_data, insights, course_name)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.2)
        )
        
        return {"explanation": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 9. Soạn mail thư AI
@router.post("/ai/draft-email")
def draft_email_with_ai(req: AIEmailRequest, current_user: dict = Depends(get_current_user)):
    try:
        genai.configure(api_key=req.api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""
        Bạn là một giảng viên đại học ân cần. Hãy viết một bản thảo email gửi cho sinh viên.
        
        Thông tin sinh viên và dữ liệu học tập:
        {json.dumps(req.student_data, ensure_ascii=False, indent=2)}
        
        Hình thức can thiệp giảng viên muốn thực hiện: {req.intervention_type}
        Ghi chú của giảng viên: {req.note}
        
        Yêu cầu:
        - Viết bằng Tiếng Việt, văn phong lịch sự, thân thiện, mang tính khích lệ.
        - Tự động điền tên sinh viên vào lời chào.
        - Đề cập khéo léo đến tình trạng học tập giảm sút (hoặc nguyên nhân theo ghi chú).
        - Kết thư với "Trân trọng, Giảng viên phụ trách".
        - Chỉ trả về nội dung Email (không gạch đầu dòng, không giới thiệu bản thân AI).
        """
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(temperature=0.3)
        )
        return {"email_draft": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import FileResponse
from import_csv_to_mongo import import_csv_to_mongo, generate_csv_template

# ... existing code ...

# 9.5. Download CSV Template
@router.get("/download-template")
def download_template(current_user: dict = Depends(get_current_user)):
    try:
        import tempfile
        temp_dir = tempfile.gettempdir()
        template_path = os.path.join(temp_dir, "LMS_Analytics_Template.csv")
        
        generate_csv_template(template_path)
        
        return FileResponse(
            path=template_path,
            filename="LMS_Analytics_Template.csv",
            media_type="text/csv"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể tạo file mẫu: {str(e)}")

# 10. Upload CSV File
@router.post("/upload-csv")
def upload_csv_file(
    file: UploadFile = File(...),
    subject_id: Optional[str] = Form(None),
    overwrite: bool = Form(False),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload CSV file với dữ liệu sinh viên
    
    Args:
        file: Uploaded CSV file
        subject_id: (Optional) ID của môn học - nếu tất cả sinh viên cùng một môn
    """
    print(f"\n📤 [upload_csv_file] Bắt đầu upload file: {file.filename}")
    print(f"   Subject ID nhận được: {subject_id}")
    
    try:
        import tempfile
        import uuid
        
        temp_dir = tempfile.gettempdir()
        file_path = os.path.join(temp_dir, f"{uuid.uuid4().hex}_{file.filename}")
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            print(f"   ✅ File saved to temp: {file_path}")
            
        # Check for existing data
        if not overwrite:
            print("   🔍 Checking for existing data...")
            existing = check_existing_data(file_path, subject_id=subject_id)
            if existing:
                print(f"   ⚠️ Found existing data for: {existing}")
                # Return 409 Conflict with details
                # Clean up temp file
                if os.path.exists(file_path):
                    os.remove(file_path)
                
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=409,
                    content={
                        "error": "DATA_EXISTS",
                        "message": "Dữ liệu cho (Môn, Lớp) này đã tồn tại trong hệ thống.",
                        "existing": existing
                    }
                )

        try:
            # Pass subject_id to import function
            print(f"   📥 Bắt đầu import vào MongoDB...")
            import_csv_to_mongo(file_path, subject_id=subject_id)
            print(f"   ✅ Import thành công!")
            
        except ValueError as ve:
            # Lỗi validation (thiếu cột, sai dữ liệu)
            print(f"   ❌ Lỗi validation: {ve}")
            raise HTTPException(status_code=400, detail=str(ve))
        
        # Clean up temp file
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"   🗑️ Temp file deleted")

        # Tự động chạy dự đoán ML cho toàn bộ sinh viên vừa import
        print(f"   🤖 Chạy auto-predict...")
        try:
            synced_count = _run_sync_predictions()
        except Exception as sync_err:
            print(f"   ❌ Sync predictions error after upload: {sync_err}")
            import traceback
            traceback.print_exc()
            synced_count = 0

        result_msg = f"Dữ liệu đã được nhập thành công và đã dự đoán cho {synced_count} sinh viên!"
        print(f"   ✅ {result_msg}\n")
        
        return {
            "message": result_msg,
            "synced": synced_count
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"   ❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================
# NEW: Subject-based Model Management Endpoints
# =========================================================

class PredictRiskBySubjectRequest(BaseModel):
    subject_id: str
    weekly_data: list

@router.post("/predict-risk-subject")
def predict_risk_by_subject(
    req: PredictRiskBySubjectRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Dự đoán rủi ro cho một sinh viên theo subject cụ thể.
    
    - Tự động load model từ models/subjects/{subject_id}/
    - Trả về risk_probability, risk_label, model accuracy, version, ...
    """
    try:
        from ml_service import predict_risk_for_subject
        result = predict_risk_for_subject(req.subject_id, req.weekly_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subjects/list")
def list_available_subjects(current_user: dict = Depends(get_current_user)):
    """Liệt kê tất cả subjects có model sẵn"""
    try:
        from ml_service import get_available_subjects
        subjects = get_available_subjects()
        return {"subjects": subjects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subjects/{subject_id}/metadata")
def get_subject_metadata_endpoint(
    subject_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Lấy metadata của một subject (version, accuracy, threshold, ...)"""
    try:
        from ml_service import get_subject_metadata
        metadata = get_subject_metadata(subject_id)
        if metadata is None:
            raise HTTPException(status_code=404, detail=f"Subject '{subject_id}' not found")
        return metadata
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class UploadSubjectModelRequest(BaseModel):
    subject_id: str
    subject_name: str
    version: str = "1.0"
    accuracy: float = 0.0
    threshold: float = 0.5
    model_file: str = "model.pkl"
    scaler_file: str = "scaler.pkl"

@router.post("/subjects/{subject_id}/upload")
async def upload_subject_model(
    subject_id: str,
    model_file: UploadFile = File(...),
    scaler_file: UploadFile = File(...),
    config_file: UploadFile = File(None),
    subject_name: Optional[str] = Form(None),
    version: str = Form("1.0"),
    accuracy: float = Form(0.0),
    threshold: float = Form(0.5),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload model (.pkl), scaler (.pkl), và config (.pkl) cho một subject.
    
    Files được lưu tại: backend/models/subjects/{subject_id}/
    Luôn lưu với tên chuẩn:
    - logistic_student_model.pkl (model file)
    - scaler_student.pkl (scaler file)
    - model_config.pkl (config file - tùy chọn)
    
    ⚠️ Threshold:
    - Nếu config_file có threshold → lấy từ đó (override threshold parameter)
    - Nếu không → dùng threshold parameter
    - Default: 0.5
    """
    try:
        from model_manager import get_model_manager, ModelMetadata
        import tempfile
        
        manager = get_model_manager()
        
        # Validate files
        if not model_file.filename.endswith('.pkl'):
            raise HTTPException(status_code=400, detail="Model file must be .pkl")
        if not scaler_file.filename.endswith('.pkl'):
            raise HTTPException(status_code=400, detail="Scaler file must be .pkl")
        if config_file and not config_file.filename.endswith('.pkl'):
            raise HTTPException(status_code=400, detail="Config file must be .pkl")
        
        # Load files (joblib.load từ bytes)
        model_bytes = await model_file.read()
        scaler_bytes = await scaler_file.read()
        config_bytes = None
        if config_file:
            config_bytes = await config_file.read()
        
        with tempfile.NamedTemporaryFile(delete=False) as tmp_m:
            tmp_m.write(model_bytes)
            tmp_model_path = tmp_m.name
        
        with tempfile.NamedTemporaryFile(delete=False) as tmp_s:
            tmp_s.write(scaler_bytes)
            tmp_scaler_path = tmp_s.name
        
        config = None
        tmp_config_path = None
        if config_bytes:
            with tempfile.NamedTemporaryFile(delete=False) as tmp_c:
                tmp_c.write(config_bytes)
                tmp_config_path = tmp_c.name
        
        try:
            model = joblib.load(tmp_model_path)
            scaler = joblib.load(tmp_scaler_path)
            config = joblib.load(tmp_config_path) if tmp_config_path else None
        finally:
            os.remove(tmp_model_path)
            os.remove(tmp_scaler_path)
            if tmp_config_path:
                os.remove(tmp_config_path)
        
        # Extract threshold và accuracy từ config nếu có
        extracted_threshold = threshold  # default: use parameter
        extracted_accuracy = accuracy   # default: use parameter
        
        if config is not None and isinstance(config, dict):
            if 'best_threshold' in config:
                extracted_threshold = config['best_threshold']
                print(f"✓ Extracted threshold từ config: {extracted_threshold}")
            elif 'threshold' in config:
                extracted_threshold = config['threshold']
                print(f"✓ Extracted threshold từ config: {extracted_threshold}")

            # Chỉ đọc accuracy từ config nếu người dùng KHÔNG nhập (accuracy == 0)
            # hoặc nếu config có giá trị hợp lệ mà người dùng để trống
            if extracted_accuracy == 0:
                for acc_key in ('accuracy', 'test_accuracy', 'val_accuracy', 'cv_accuracy', 'score'):
                    if acc_key in config:
                        raw_acc = config[acc_key]
                        if raw_acc is not None:
                            # Nếu <= 1 (dạng 0.87) thì quy về % (87.0), nếu > 1 thì giữ nguyên (87.0)
                            extracted_accuracy = float(raw_acc) * 100 if float(raw_acc) <= 1 else float(raw_acc)
                            print(f"✓ Extracted accuracy từ config[{acc_key}]: {extracted_accuracy}")
                            break

        # Đảm bảo subject_name không bị null hoặc rỗng
        final_subject_name = subject_name.strip() if (subject_name and subject_name.strip()) else subject_id
        
        # Create metadata with standard file names
        metadata = ModelMetadata(
            subject_id=subject_id,
            subject_name=final_subject_name,
            version=version,
            accuracy=extracted_accuracy,
            threshold=extracted_threshold,
            model_file="logistic_student_model.pkl",
            scaler_file="scaler_student.pkl",
            config_file="model_config.pkl" if config_file else None,
        )
        
        # Save
        success = manager.save_model(subject_id, model, scaler, metadata, config)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save model")
        
        return {
            "message": f"Model uploaded successfully for subject '{subject_id}'",
            "subject_id": subject_id,
            "metadata": metadata.to_dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/subjects/{subject_id}/metadata")
async def update_subject_metadata(
    subject_id: str,
    subject_name: Optional[str] = None,
    accuracy: Optional[float] = None,
    version: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Cập nhật tên hiển thị và/hoặc độ chính xác của một subject đã tồn tại."""
    try:
        from model_manager import get_model_manager
        import json as _json

        manager = get_model_manager()
        subject_dir = manager.get_subject_dir(subject_id)
        metadata_path = os.path.join(subject_dir, "metadata.json")

        if not os.path.exists(metadata_path):
            raise HTTPException(status_code=404, detail=f"Subject '{subject_id}' not found")

        with open(metadata_path, "r", encoding="utf-8") as f:
            meta = _json.load(f)

        if subject_name is not None and subject_name.strip():
            meta["subject_name"] = subject_name.strip()
        if accuracy is not None:
            meta["accuracy"] = accuracy
        if version is not None and version.strip():
            meta["version"] = version.strip()

        with open(metadata_path, "w", encoding="utf-8") as f:
            _json.dump(meta, f, indent=2, ensure_ascii=False)

        # Invalidate cache
        manager._metadata_cache.pop(subject_id, None)
        manager._models_cache.pop(subject_id, None)

        return {"message": "Metadata updated", "metadata": meta}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/subjects/{subject_id}")
def delete_subject_model(
    subject_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Xóa model của một subject"""
    try:
        from model_manager import get_model_manager
        manager = get_model_manager()
        success = manager.delete_model(subject_id)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Subject '{subject_id}' not found")
        
        return {"message": f"Model deleted for subject '{subject_id}'"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

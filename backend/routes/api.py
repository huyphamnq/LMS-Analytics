from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from routes.auth import get_current_user
from database import student_logs, predictions, interventions
from ml_service import predict_risk, calculate_effort_score, _models as ml_models, load_models
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json
import google.generativeai as genai
import statistics
import os
import shutil
from import_csv_to_mongo import import_csv_to_mongo

router = APIRouter()


def _run_sync_predictions():
    """
    Chạy dự đoán cho toàn bộ sinh viên trong student_logs và lưu vào predictions.
    Sử dụng (student_id, course_name) làm định danh duy nhất.
    """
    students = list(student_logs.find())
    if not students:
        return 0

    docs = []
    for stu in students:
        if "weekly_data" not in stu or not stu["weekly_data"]:
            continue
        weekly_data = stu["weekly_data"]
        try:
            result       = predict_risk(weekly_data)
            effort_score = calculate_effort_score(weekly_data)
            week_nums    = [w.get("week") for w in weekly_data if w.get("week")]
            latest_week  = max(week_nums) if week_nums else 1
            
            # Upsert into predictions collection
            filter_query = {
                "student_id":  stu["student_id"],
                "course_name": stu["course_name"]
            }
            
            pred_doc = {
                "student_id":       stu["student_id"],
                "course_name":      stu["course_name"],
                "week":             latest_week,
                "risk_probability": result["risk_probability"],
                "risk_label":       result["risk_label"],
                "effort_score":     effort_score,
                "model_probs":      result["model_probs"],
                "updated_at":       datetime.now()
            }
            
            predictions.update_one(filter_query, {"$set": pred_doc}, upsert=True)
            docs.append(pred_doc)
            
        except Exception as e:
            print(f"Sync predict error for {stu.get('student_id', '?')} in {stu.get('course_name', '?')}: {e}")

    return len(docs)

# Helper to get dynamic risk based on selected model
def resolve_risk(doc, selected_model="Logistic Regression"):
    """Tính risk label dùng ngưỡng tối ưu từ model_config.pkl."""
    model_probs = doc.get("model_probs") or {}
    prob = model_probs.get("logistic") or doc.get("risk_probability")
    # Dùng threshold tối ưu từ model nếu đã load, fallback 0.5
    threshold = ml_models.get('threshold', 0.5)
    label = "Nguy cơ" if (prob is not None and prob >= threshold) else "An toàn"
    return prob, label

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

# Helper to JSON serialize MongoDB cursor
def serialize_doc(doc):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

# 1. Danh sách sinh viên
@router.get("/students")
def get_students(course: Optional[str] = None, class_name: Optional[str] = None, risk_label: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    # 1. Tìm danh sách sinh viên cơ bản
    query = {}
    if course: query["course_name"] = course
    if class_name: query["class_name"] = class_name
    
    students_cursor = student_logs.find(query, {"weekly_data": 0}).sort("full_name", 1)
    students_list = [serialize_doc(doc) for doc in students_cursor]
    
    if not students_list:
        return []

    # 2. Lấy danh sách composite keys (student_id + course_name)
    student_ids = [s["student_id"] for s in students_list]
    
    # 3. Lấy kết quả dự báo mới nhất
    # Vì một student_id có thể học nhiều course_name, ta cần so khớp cả hai
    preds_cursor = predictions.find({"student_id": {"$in": student_ids}})
    
    # Tạo map với key là "student_id|course_name"
    preds_map = {}
    for p in preds_cursor:
        key = f"{p['student_id']}|{p.get('course_name', '')}"
        preds_map[key] = serialize_doc(p)

    # 4. Ghép dữ liệu dự đoán
    final_list = []
    for s in students_list:
        key = f"{s['student_id']}|{s['course_name']}"
        s["latest_prediction"] = preds_map.get(key)
        
        # 5. Lọc theo Risk Label
        if risk_label and risk_label != "all":
            current_risk = s["latest_prediction"].get("risk_label") if s.get("latest_prediction") else None
            if current_risk == risk_label:
                final_list.append(s)
        else:
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
    
    for p in pred_history:
        prob, label = resolve_risk(p)
        p["risk_probability"] = prob
        p["risk_label"] = label
    
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
            "risk_probability": {"$first": "$risk_probability"},
            "model_probs": {"$first": "$model_probs"}
        }
    })
    
    latest_preds = list(predictions.aggregate(pipeline))
    
    selected_model = current_user.get("selectedModel", "Ensemble")
    risk_count: int = 0
    for p in latest_preds:
        _, label = resolve_risk(p, selected_model)
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
        prob, label = resolve_risk(p, selected_model)
        if label == "Nguy cơ":
            rid = p["_id"]
            risky_ids.append(rid)
            risky_probs[rid] = prob
            risky_efforts[rid] = p.get("effort_score", 0)
            
    # Batch fetch student metadata
    students_meta = {s["student_id"]: s for s in student_logs.find({"student_id": {"$in": risky_ids}}, {"weekly_data": 0})}
    
    risky_students = []
    for rid in risky_ids:
        stu = students_meta.get(rid)
        risky_students.append({
            "student_id": rid,
            "student_name": stu["full_name"] if stu else "Unknown",
            "class_name": stu["class_name"] if stu else "Unknown",
            "course_name": stu["course_name"] if stu else "Unknown",
            "risk_probability": risky_probs[rid],
            "risk_label": "Nguy cơ",
            "effort_score": risky_efforts[rid]
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
        prob, label = resolve_risk(p, selected_model)
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

# 5. API dự đoán sinh viên nguy cơ - có thể cập nhật db predictions luôn
@router.post("/predict")
def predict_student_risk(data: BehaviorData, current_user: dict = Depends(get_current_user)):
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
    
    # Chạy AI inference
    result       = predict_risk(weekly_data)
    effort_score = calculate_effort_score(weekly_data)
    
    doc = {
        "student_id":       data.student_id,
        "week":             data.week,
        "risk_probability": result["risk_probability"],
        "risk_label":       result["risk_label"],
        "effort_score":     effort_score,
        "model_probs":      result["model_probs"],
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
                
    # Calculate Mean & Standard Deviation
    mean_effort = statistics.mean(valid_efforts) if len(valid_efforts) > 0 else 0
    std_effort = statistics.stdev(valid_efforts) if len(valid_efforts) > 1 else 0
    
    mean_score = statistics.mean(valid_scores) if len(valid_scores) > 0 else 0
    std_score = statistics.stdev(valid_scores) if len(valid_scores) > 1 else 0
    
    mean_login = statistics.mean(valid_logins) if len(valid_logins) > 0 else 0
    std_login = statistics.stdev(valid_logins) if len(valid_logins) > 1 else 0

    # Pass 2: Apply Z-Score outlier detection
    for item in raw_dat:
        z_effort = (item["effort"] - mean_effort) / std_effort if std_effort > 0 else 0
        z_score = (item["score"] - mean_score) / std_score if std_score > 0 else 0
        z_login = (item["login"] - mean_login) / std_login if std_login > 0 else 0
        
        anomaly_type = "Bình thường"
        reason = "Hoạt động học tập ổn định so với lớp."
        risk_level = "Thấp"
        
        # 1. Nghi vấn gian lận
        if z_effort <= -1.0 and z_score >= 1.0:
            anomaly_type = "Nghi vấn gian lận"
            reason = "Nỗ lực thấp hơn mặt bằng chung rất nhiều nhưng điểm số cao đột biến."
            risk_level = "Cao"
        
        # 2. Nguy cơ kiệt sức
        elif z_effort >= 1.0 and z_score <= -1.0:
            anomaly_type = "Nguy cơ kiệt sức"
            reason = "Dành nhiều nỗ lực hơn hẳn các bạn khác nhưng kết quả lại cực kỳ thấp."
            risk_level = "Trung bình"
            
        # 3. Hoạt động bất thường (Spike)
        elif z_login >= 2.0:
            anomaly_type = "Hoạt động bất thường"
            reason = "Tần suất đăng nhập quá cao so với trung bình của lớp."
            risk_level = "Trung bình"
        
        # 4. Học tập không hiệu quả (Active but no score)
        elif item["active_days"] >= 6 and z_score <= -1.5:
            anomaly_type = "Học tập không hiệu quả"
            reason = "Truy cập hệ thống thường xuyên nhưng điểm số rớt thảm hại so với lớp."
            risk_level = "Cao"

        # Lấy Risk Label từ Model đã chọn
        ml_prob, ml_label = resolve_risk(item["eff_obj"], selected_model)

        scatter_data.append({
            "student_id": item["s_id"],
            "student_name": item["student"].get("full_name", "Unknown"),
            "class_name": item["student"].get("class_name", "Unknown"),
            "course_name": item["student"].get("course_name", "Unknown"),
            "effort_score": item["effort"],
            "score": item["score"],
            "anomaly_type": anomaly_type,
            "reason": reason,
            "risk_level": risk_level,
            "ml_risk_label": ml_label,
            "ml_risk_prob": ml_prob,
            "details": item["week_log"]
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
        
    q = {"created_by": current_user["email"]}
    if student_ids is not None:
        q["student_id"] = {"$in": student_ids}
        
    inv_list = list(interventions.find(q).sort("date", -1))
    
    if inv_list:
        stu_ids = list(set([i["student_id"] for i in inv_list]))
        students_meta = {s["student_id"]: s for s in student_logs.find({"student_id": {"$in": stu_ids}}, {"full_name": 1, "student_id": 1})}
        
        for inv in inv_list:
            stu = students_meta.get(inv["student_id"])
            inv["student_name"] = stu["full_name"] if stu else "Unknown"
            serialize_doc(inv)
        
    return inv_list

@router.get("/ml/metrics")
def get_model_metrics():
    """Trả về thông số kỹ thuật của model đang dùng."""
    try:
        load_models()
        threshold = ml_models.get('threshold', 0.5)
    except Exception:
        threshold = 0.5
    return [
        {
            "model": "Logistic Regression",
            "accuracy": 0.96,
            "f1": 0.963,
            "threshold": threshold,
            "features": 27,  # 9 metrics × 3 tuần (W1, W2, W3)
            "description": "Mô hình logistic regression huấn luyện trên 27 features hành vi học tập (9 metrics × W1-W3), không dùng W4 để tránh data leakage."
        },
    ]

# 8. Giải thích AI
@router.post("/ai/explain")
def explain_with_ai(req: AIExplainRequest, current_user: dict = Depends(get_current_user)):
    try:
        genai.configure(api_key=req.api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""
        Bạn là một trợ lý ảo chuyên phân tích dữ liệu học tập của sinh viên.
        Dưới đây là một bản tóm tắt dữ liệu của một sinh viên trong hệ thống (bao gồm điểm rủi ro và log hành vi):
        
        {json.dumps(req.student_data, ensure_ascii=False, indent=2)}
        
        Hãy viết một đoạn văn ngắn (khoảng 3-4 câu tiếng Việt) giải thích tại sao sinh viên này lại có mức rủi ro hiện tại. Nhấn mạnh vào xu hướng chuyên cần, điểm số hoặc sự lơ là. Văn phong khách quan, dễ hiểu dành cho giảng viên đọc.
        """
        response = model.generate_content(prompt)
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
        response = model.generate_content(prompt)
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
        temp_dir = os.path.join(os.path.dirname(__file__), '..', 'datasets', 'temp')
        os.makedirs(temp_dir, exist_ok=True)
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
def upload_csv_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    try:
        temp_dir = os.path.join(os.path.dirname(__file__), '..', 'datasets', 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        try:
            import_csv_to_mongo(file_path)
        except ValueError as ve:
            # Lỗi validation (thiếu cột, sai dữ liệu)
            raise HTTPException(status_code=400, detail=str(ve))
        
        # Clean up temp file
        if os.path.exists(file_path):
            os.remove(file_path)

        # Tự động chạy dự đoán ML cho toàn bộ sinh viên vừa import
        try:
            synced_count = _run_sync_predictions()
        except Exception as sync_err:
            print(f"Sync predictions error after upload: {sync_err}")
            synced_count = 0

        return {
            "message": f"Dữ liệu đã được nhập thành công và đã dự đoán cho {synced_count} sinh viên!",
            "synced": synced_count
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from fastapi import APIRouter, HTTPException
from database import student_logs, predictions, interventions
from ml_service import predict_risk, calculate_effort_score
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json
import google.generativeai as genai

router = APIRouter()

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
    intervention_type: str
    note: str

# Schema for incoming learning behavior data mapping
class BehaviorData(BaseModel):
    student_id: str
    week: int
    active_days: int
    login_count: int
    video_views: int
    document_reads: int
    discussion: int
    assignment_attempt: int
    assignment_time: float
    weekly_score: Optional[float] = None

# Helper to JSON serialize MongoDB cursor
def serialize_doc(doc):
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

# 1. Danh sách sinh viên
@router.get("/students")
def get_students():
    # Lấy danh sách duy nhất thông qua thông tin sinh viên cơ bản (bỏ weekly_data)
    cursor = student_logs.find({}, {"weekly_data": 0})
    return [serialize_doc(doc) for doc in cursor]

# 2. Chi tiết sinh viên + dữ liệu logs theo tuần
@router.get("/students/{student_id}")
def get_student_details(student_id: str):
    student = student_logs.find_one({"student_id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    # Lấy các lịch sử dự đoán mới nhất
    pred_history = list(predictions.find({"student_id": student_id}).sort("week", -1))
    
    # Lấy lịch sử can thiệp
    interventions_hist = list(interventions.find({"student_id": student_id}).sort("date", -1))
    
    return {
        "profile": serialize_doc(student),
        "predictions": [serialize_doc(p) for p in pred_history],
        "interventions": [serialize_doc(i) for i in interventions_hist]
    }

# 3. Thống kê dashboard
@router.get("/dashboard/summary")
def get_dashboard_summary():
    # Sử dụng log mới nhất (hoặc list sinh viên) để count
    total_students = student_logs.count_documents({})
    
    # Pipeline mongodb để lấy record dự đoán có tuần lớn nhất (mới nhất) cho từng sinh viên
    pipeline = [
        {"$sort": {"week": -1}},
        {
            "$group": {
                "_id": "$student_id",
                "latest_label": {"$first": "$risk_label"},
                "latest_prob": {"$first": "$risk_probability"}
            }
        }
    ]
    latest_preds = list(predictions.aggregate(pipeline))
    
    risk_count = sum(1 for p in latest_preds if p["latest_label"] == "Nguy cơ")
    safe_count = total_students - risk_count
    
    risk_percentage = 0
    if total_students > 0:
         risk_percentage = round((risk_count / total_students) * 100, 1)

    return {
        "total_students": total_students,
        "safe_students": safe_count,
        "risk_students": risk_count,
        "risk_percentage": risk_percentage
    }

# 4. Danh sách cảnh báo sớm
@router.get("/early-warning")
def get_early_warning():
    # Aggregate student logs với latest predictions đang bị nguy cơ
    pipeline = [
        {"$sort": {"week": -1}}, # ưu tiên predicion tuần mới nhất
        {
            "$group": {
                "_id": "$student_id",
                "risk_probability": {"$first": "$risk_probability"},
                "risk_label": {"$first": "$risk_label"},
                "effort_score": {"$first": "$effort_score"}
            }
        },
        {"$match": {"risk_label": "Nguy cơ"}}
    ]
    
    risky_students = list(predictions.aggregate(pipeline))
    
    # Điền thêm Tên sinh viên từ student_logs
    for rs in risky_students:
        stu = student_logs.find_one({"student_id": rs["_id"]})
        rs["student_name"] = stu["full_name"] if stu else "Unknown"
        rs["student_id"] = rs["_id"]
        del rs["_id"]
        
    return risky_students

# 5. API dự đoán sinh viên nguy cơ - có thể cập nhật db predictions luôn
@router.post("/predict")
def predict_student_risk(data: BehaviorData):
    # Lấy features dưới dạng dict
    features = data.dict()
    
    # Chạy AI inference (3 mô hình ML scaler)
    result = predict_risk(features)
    
    # Tính Effort Score phụ trợ
    effort_score = calculate_effort_score(features)
    
    doc = {
        "student_id": data.student_id,
        "week": data.week,
        "risk_probability": result["risk_probability"],
        "risk_label": result["risk_label"],
        "effort_score": effort_score,
        "model_probs": result["model_probs"]
    }
    
    # Lưu kết quả dự đoán vào Mongodb
    predictions.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    
    return doc

# 6. Dữ liệu biểu đồ phát hiện bất thường Scatter
@router.get("/integrity")
def get_integrity_data():
    # Ta cần lấy nỗ lực và điểm số ở tuần mới nhất
    # Lấy latest prediction effort
    pipeline = [
        {"$sort": {"week": -1}},
        {
            "$group": {
                "_id": "$student_id",
                "effort_score": {"$first": "$effort_score"},
                "week": {"$first": "$week"}
            }
        }
    ]
    latest_efforts = list(predictions.aggregate(pipeline))
    
    scatter_data = []
    for eff in latest_efforts:
        s_id = eff["_id"]
        week = eff["week"]
        
        # Lấy điểm số sinh viên tại week tương ứng trong logs
        student = student_logs.find_one({"student_id": s_id})
        
        if student and "weekly_data" in student:
            # tìm record của tuần đó
            week_log = next((w for w in student["weekly_data"] if w["week"] == week), None)
            if week_log:
                scatter_data.append({
                    "student_id": s_id,
                    "student_name": student["full_name"],
                    "effort_score": eff["effort_score"],
                    "score": week_log.get("weekly_score", 0)
                })
    return scatter_data

# 7. Quản lý can thiệp
@router.post("/intervention")
def add_intervention(inv: InterventionCreate):
    doc = {
        "student_id": inv.student_id,
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "intervention_type": inv.intervention_type,
        "note": inv.note
    }
    result = interventions.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc

@router.get("/interventions")
def get_interventions():
    # Lấy toàn bộ với join simple lấy tên sinh viên
    inv_list = list(interventions.find().sort("date", -1))
    for inv in inv_list:
        stu = student_logs.find_one({"student_id": inv["student_id"]})
        inv["student_name"] = stu["full_name"] if stu else "Unknown"
        serialize_doc(inv)
        
    return inv_list

# 8. Giải thích AI
@router.post("/ai/explain")
def explain_with_ai(req: AIExplainRequest):
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
def draft_email_with_ai(req: AIEmailRequest):
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


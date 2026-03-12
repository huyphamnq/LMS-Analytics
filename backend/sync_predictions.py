from pymongo import MongoClient
import os
import sys

# Đảm bảo import được module
sys.path.append(os.path.dirname(__file__))

from ml_service import predict_risk, calculate_effort_score

CONNECTION_STRING = "mongodb+srv://admin:wJMki8dRVcogi2eZ@cluster0.wmjiwis.mongodb.net/?appName=Cluster0"
client = MongoClient(CONNECTION_STRING)
db = client["LMS-Anlytics"]

student_logs = db["student_logs"]
predictions = db["predictions"]

def sync():
    print("Xóa bản ghi predictions cũ...")
    predictions.delete_many({})
    
    students = list(student_logs.find())
    print(f"Lấy được {len(students)} sinh viên từ DB thật.")
    
    predictions_docs = []
    
    for stu in students:
        if "weekly_data" not in stu:
            continue
            
        for w in stu["weekly_data"]:
            # Cấu trúc feature cho hàm predict_risk từ dict
            features = {
                "active_days": w.get("active_days", 0),
                "login_count": w.get("login_count", 0),
                "video_views": w.get("video_views", 0),
                "document_reads": w.get("document_reads", 0),
                "discussion": w.get("discussion", 0),
                "assignment_attempt": w.get("assignment_attempt", 0),
                "assignment_time": w.get("assignment_time", 0)
            }
            
            # Predict
            try:
                result = predict_risk(features)
                effort_score = calculate_effort_score(features)
                
                doc = {
                    "student_id": stu["student_id"],
                    "week": w.get("week", 1),
                    "risk_probability": result["risk_probability"],
                    "risk_label": result["risk_label"],
                    "effort_score": effort_score,
                    "model_probs": result["model_probs"]
                }
                predictions_docs.append(doc)
            except Exception as e:
                print("Lỗi khi predict", e)
                
    if predictions_docs:
        predictions.insert_many(predictions_docs)
        print(f"Đã tạo {len(predictions_docs)} bản ghi dự đoán thành công!")
    else:
        print("Không có log nào để dự đoán.")

if __name__ == "__main__":
    sync()

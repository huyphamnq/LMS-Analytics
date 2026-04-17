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
predictions  = db["predictions"]


def sync():
    print("Xóa bản ghi predictions cũ...")
    predictions.delete_many({})

    students = list(student_logs.find())
    print(f"Lấy được {len(students)} sinh viên từ DB thật.")

    predictions_docs = []

    for stu in students:
        if "weekly_data" not in stu or not stu["weekly_data"]:
            continue

        weekly_data = stu["weekly_data"]  # list các dict tuần 1-4

        try:
            # Model dùng tuần 1-3 để dự đoán (giống training code)
            result       = predict_risk(weekly_data)
            effort_score = calculate_effort_score(weekly_data)

            # Ghi 1 bản prediction cho sinh viên (tuần mới nhất = tuần 4)
            week_nums = [w.get("week") for w in weekly_data if w.get("week")]
            latest_week = max(week_nums) if week_nums else 4

            doc = {
                "student_id":       stu["student_id"],
                "week":             latest_week,
                "risk_probability": result["risk_probability"],
                "risk_label":       result["risk_label"],
                "effort_score":     effort_score,
                "model_probs":      result["model_probs"],
            }
            predictions_docs.append(doc)

        except Exception as e:
            print(f"Lỗi khi predict sinh viên {stu.get('student_id', '?')}: {e}")

    if predictions_docs:
        predictions.insert_many(predictions_docs)
        print(f"Đã tạo {len(predictions_docs)} bản ghi dự đoán thành công!")
    else:
        print("Không có log nào để dự đoán.")


if __name__ == "__main__":
    sync()

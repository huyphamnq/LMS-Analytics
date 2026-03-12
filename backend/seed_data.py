from pymongo import MongoClient
import random
from datetime import datetime, timedelta

# Sử dụng chung chuỗi kết nối
CONNECTION_STRING = "mongodb+srv://admin:wJMki8dRVcogi2eZ@cluster0.wmjiwis.mongodb.net/?appName=Cluster0"
client = MongoClient(CONNECTION_STRING)
db = client["LMS-Analytics"]

student_logs = db["student_logs"]
predictions = db["predictions"]
interventions = db["interventions"]

# Hàm tạo data giả
def seed():
    # Xoá dữ liệu cũ
    student_logs.delete_many({})
    predictions.delete_many({})
    interventions.delete_many({})
    
    first_names = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"]
    middle_names = ["Văn", "Thị", "Ngọc", "Thanh", "Minh", "Thu", "Đức", "Xuân", "Hải", "Tuấn", "Hoài", "Quốc", "Phi"]
    last_names = ["An", "Bình", "Châu", "Dũng", "Em", "Phúc", "Giang", "Hà", "Ý", "Khánh", "Linh", "My", "Nhung", "Oanh", "Phong", "Quân", "Tâm", "Thảo", "Vy", "Trang"]

    courses = ["Nhập môn Lập trình", "Cấu trúc dữ liệu", "Hệ quản trị CSDL", "Trí tuệ nhân tạo"]

    students = []
    
    # Tạo 25 sinh viên
    for i in range(1, 26):
        student_id = f"SV2021{i:04d}"
        full_name = f"{random.choice(first_names)} {random.choice(middle_names)} {random.choice(last_names)}"
        email = f"{full_name.lower().replace(' ', '')}@university.edu.vn"
        course = random.choice(courses)
        
        # Đặc điểm học của SV này (tốt hay kém)
        is_good_student = random.random() > 0.3 # 70% tốt, 30% kém
        
        weekly_data = []
        # Giả lập 10 tuần học
        for week in range(1, 11):
            if is_good_student:
                active_days = random.randint(3, 7)
                login_count = random.randint(10, 30)
                video_views = random.randint(5, 15)
                document_reads = random.randint(5, 20)
                discussion = random.randint(1, 5)
                assignment_attempt = random.randint(1, 3)
                assignment_time = random.uniform(1.0, 5.0)
                weekly_score = random.uniform(7.0, 10.0)
            else:
                # Có thể là anomaly: effort thấp điểm cao, hoặc effort cao điểm thấp
                anomaly = random.random() > 0.8
                if anomaly:
                    # Effort thấp điểm cao
                    active_days = random.randint(1, 2)
                    login_count = random.randint(1, 5)
                    video_views = random.randint(0, 3)
                    document_reads = random.randint(0, 2)
                    discussion = 0
                    assignment_attempt = 1
                    assignment_time = random.uniform(0.1, 1.0)
                    weekly_score = random.uniform(8.0, 10.0)
                else:
                    active_days = random.randint(0, 3)
                    login_count = random.randint(2, 8)
                    video_views = random.randint(0, 5)
                    document_reads = random.randint(0, 5)
                    discussion = random.randint(0, 1)
                    assignment_attempt = random.randint(0, 2)
                    assignment_time = random.uniform(0.0, 2.0)
                    weekly_score = random.uniform(2.0, 5.0)
            
            weekly_data.append({
                "week": week,
                "active_days": active_days,
                "login_count": login_count,
                "video_views": video_views,
                "document_reads": document_reads,
                "discussion": discussion,
                "assignment_attempt": assignment_attempt,
                "assignment_time": round(assignment_time, 2),
                "weekly_score": round(weekly_score, 1)
            })
            
        student_doc = {
            "student_id": student_id,
            "full_name": full_name,
            "email": email,
            "course": course,
            "weekly_data": weekly_data
        }
        students.append(student_doc)

    student_logs.insert_many(students)
    
    # Sinh predictions dựa trên logs (chạy mock simple ko cần gọi ml_service để tiết kiệm thời gian, vì mục đích là có data chart)
    predictions_data = []
    
    for stu in students:
        for w in stu["weekly_data"]:
            # effort score
            effort_score = (w["active_days"] * 1.5 + w["video_views"] * 0.5 + 
                          w["discussion"] * 2.0 + w["document_reads"] * 0.8 + 
                          w["assignment_time"] * 0.1)
            
            # Simple heuristic mock prediction:
            prob = max(0.0, min(1.0, 1.0 - (effort_score / 30.0))) 
            prob += random.uniform(-0.1, 0.1) # Thêm nhiễu
            prob = max(0.0, min(1.0, prob))
            
            label = "Nguy cơ" if prob >= 0.5 else "An toàn"
            
            predictions_data.append({
                "student_id": stu["student_id"],
                "week": w["week"],
                "risk_probability": round(prob, 4),
                "risk_label": label,
                "effort_score": round(effort_score, 2),
                "model_probs": {
                    "logistic": round(prob + random.uniform(-0.05, 0.05), 4),
                    "random_forest": round(prob + random.uniform(-0.05, 0.05), 4),
                    "lightgbm": round(prob + random.uniform(-0.05, 0.05), 4)
                }
            })
            
    predictions.insert_many(predictions_data)
    
    # Tạo vài interventions mẫu
    recent_risky = [p for p in predictions_data if p["week"] == 10 and p["risk_label"] == "Nguy cơ"]
    interventions_data = []
    
    types = ["Nhắc nhở qua Email", "Gọi điện thoại", "Gặp mặt trực tiếp", "Liên hệ Cố vấn học tập"]
    
    # Chỉ chọn khoảng 5 học sinh risky để có can thiệp
    for p in recent_risky[:5]:
        past_date = datetime.now() - timedelta(days=random.randint(1, 14))
        interventions_data.append({
            "student_id": p["student_id"],
            "date": past_date.strftime("%Y-%m-%d %H:%M:%S"),
            "intervention_type": random.choice(types),
            "note": "Sinh viên ít tương tác hệ thống. Đã gửi cảnh báo và hẹn lịch lên phòng mượn thiết bị."
        })
        
    if interventions_data:
        interventions.insert_many(interventions_data)
        
    print(f"Data seeded successfully! Added {len(students)} students, {len(predictions_data)} predictions, and {len(interventions_data)} interventions.")

if __name__ == "__main__":
    seed()

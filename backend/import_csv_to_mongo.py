import csv
from datetime import datetime, timezone
from database import db, student_logs
import os
from pydantic import BaseModel, Field, EmailStr, validator
from typing import List, Optional, Dict, Any

# =========================================================
# Schema & Configuration
# =========================================================

METRICS = [
    'active_days', 'login_count', 'video_views', 'document_reads', 'discussion',
    'assignment_duration_mins', 'ontime_margin', 'days_since_last_login', 'session_duration', 'weekly_score'
]

WEEKS = [1, 2, 3]

def get_required_columns():
    cols = ['student_id', 'full_name', 'email', 'class', 'course']
    for w in WEEKS:
        for m in METRICS:
            cols.append(f"{m}_w{w}")
    return cols

def normalize_csv_header_name(name: str) -> str:
    return (name or "").replace("\ufeff", "").strip().lower()

def normalize_csv_reader_headers(csv_reader: csv.DictReader):
    if csv_reader.fieldnames is None:
        raise ValueError("File CSV không có dòng header")
    csv_reader.fieldnames = [normalize_csv_header_name(col) for col in csv_reader.fieldnames]
    return csv_reader.fieldnames

class CSVRowSchema(BaseModel):
    student_id: str = Field(..., min_length=1)
    full_name: str = Field(..., min_length=1)
    email: str = Field(..., min_length=1)
    class_name: str = Field(..., alias="class")
    course_name: str = Field(..., alias="course")
    
    # Weekly data will be validated dynamically or as a dict
    # For simplicity in this script, we'll validate the base fields 
    # and then check metrics in the loop.

def _int(value) -> int:
    try:
        return int(float(value)) if value not in (None, '', 'nan') else 0
    except (ValueError, TypeError):
        return 0

def _float(value) -> float:
    try:
        return float(value) if value not in (None, '', 'nan') else 0.0
    except (ValueError, TypeError):
        return 0.0

def validate_csv_header(header: List[str]):
    header = [normalize_csv_header_name(col) for col in (header or [])]
    required = get_required_columns()
    missing = [col for col in required if col not in header]
    if missing:
        raise ValueError(f"Thiếu các cột bắt buộc: {', '.join(missing)}")
    return True

def generate_csv_template(output_path: str):
    cols = get_required_columns()
    with open(output_path, mode='w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(cols)
        # Sample row
        sample = ["SV001", "Nguyen Van A", "a.nguyen@example.com", "L01", "C++"]
        for w in WEEKS:
            for m in METRICS:
                if m == 'active_days': sample.append("5")
                elif 'score' in m or 'margin' in m or 'duration' in m: sample.append("8.5")
                else: sample.append("10")
        writer.writerow(sample)
    return output_path

def check_existing_data(csv_file_path: str, subject_id: str = None) -> List[Dict[str, str]]:
    """
    Kiểm tra xem dữ liệu trong CSV đã tồn tại trong DB chưa.
    Trả về danh sách các (course_name, class_name) đã có dữ liệu.
    """
    if not os.path.exists(csv_file_path):
        return []

    unique_combos = set()
    with open(csv_file_path, mode='r', encoding='utf-8-sig') as file:
        csv_reader = csv.DictReader(file)
        normalize_csv_reader_headers(csv_reader)
        for row in csv_reader:
            c_name = row.get('course', '').strip()
            cl_name = row.get('class', '').strip()
            s_id = subject_id if subject_id else c_name.lower().replace(' ', '_').strip()
            if c_name and cl_name and s_id:
                unique_combos.add((s_id, c_name, cl_name))

    existing = []
    for s_id, c_name, cl_name in unique_combos:
        # Check if any student exists with this combo
        count = student_logs.count_documents({
            "subject_id": s_id,
            "course_name": c_name,
            "class_name": cl_name
        })
        if count > 0:
            existing.append({
                "subject_id": s_id,
                "course_name": c_name,
                "class_name": cl_name
            })
    
    return existing

def import_csv_to_mongo(csv_file_path, subject_id: str = None):
    """
    Import CSV vào MongoDB
    
    Args:
        csv_file_path: Đường dẫn file CSV
        subject_id: ID của môn học (nếu tất cả sinh viên cùng một môn)
    """
    print(f"Reading and validating data from: {csv_file_path}")
    if subject_id:
        print(f"Subject ID: {subject_id}")

    if not os.path.exists(csv_file_path):
        raise FileNotFoundError(f"File không tồn tại: {csv_file_path}")
    
    # Validate subject_id has a model (if provided)
    if subject_id:
        from ml_service import get_available_subjects
        available_subjects = get_available_subjects()
        available_subject_ids = [s['subject_id'] for s in available_subjects]
        
        if subject_id not in available_subject_ids:
            raise ValueError(
                f"❌ Subject '{subject_id}' chưa có model.\n"
                f"Vui lòng upload model trước khi import dữ liệu.\n"
                f"Available subjects: {', '.join(available_subject_ids)}"
            )
    else:
        print("⚠️  Warning: subject_id not provided, will use course_name fallback")

    documentsToInsert = []

    with open(csv_file_path, mode='r', encoding='utf-8-sig') as file:
        csv_reader = csv.DictReader(file)
        normalized_header = normalize_csv_reader_headers(csv_reader)
        
        # Validate Header
        validate_csv_header(normalized_header)

        line_num = 1
        for row in csv_reader:
            line_num += 1
            try:
                # Basic info validation
                # Note: 'class' and 'course' are reserved/special in some contexts, but DictReader is fine
                # We use simple strip() here as Pydantic is a bit overkill for every single cell if performance matters,
                # but we'll use it for the main structure.
                
                weekly_data = []
                for week in WEEKS:
                    w = f"w{week}"
                    # Validation rules can be added here
                    active_days = _int(row.get(f'active_days_{w}'))
                    if not (0 <= active_days <= 7):
                        raise ValueError(f"Dòng {line_num}: active_days_w{week} phải từ 0-7 (hiện tại: {active_days})")

                    weekly_data.append({
                        'week':                     week,
                        'active_days':              active_days,
                        'login_count':              _int(row.get(f'login_count_{w}')),
                        'online_count':             _int(row.get(f'login_count_{w}')),
                        'video_views':              _int(row.get(f'video_views_{w}')),
                        'document_reads':           _int(row.get(f'document_reads_{w}')),
                        'discussion':               _int(row.get(f'discussion_{w}')),
                        'assignment_duration_mins': _float(row.get(f'assignment_duration_mins_{w}')),
                        'ontime_margin':            _float(row.get(f'ontime_margin_{w}')),
                        'days_since_last_login':    _int(row.get(f'days_since_last_login_{w}')),
                        'session_duration':         _float(row.get(f'session_duration_{w}')),
                        'weekly_score':             _float(row.get(f'weekly_score_{w}')),
                    })

                document = {
                    'student_id':  row.get('student_id', '').strip(),
                    'full_name':   row.get('full_name', '').strip(),
                    'email':       row.get('email', '').strip(),
                    'class_name':  row.get('class', '').strip(),
                    'course_name': row.get('course', '').strip(),
                    'subject_id':  subject_id if subject_id else row.get('course', '').lower().replace(' ', '_').strip(),  # ← Auto-inject
                    'status':      'in_progress',
                    'weekly_data': weekly_data,
                    'updated_at':  datetime.now(timezone.utc),
                    'created_at':  datetime.now(timezone.utc),
                }

                if not document['student_id']:
                    raise ValueError(f"Dòng {line_num}: student_id không được để trống")
                if not document['subject_id']:
                    raise ValueError(f"Dòng {line_num}: Không thể xác định subject_id. Vui lòng cung cấp subject_id khi import.")
                if not document['subject_id']:
                    raise ValueError(f"Dòng {line_num}: subject_id không được để trống (phải chỉ định môn học)")

                documentsToInsert.append(document)
            except Exception as e:
                # Re-raise to stop process and inform user
                raise ValueError(str(e))

    # UPSERT strategy: Check for existing student + course combo
    if documentsToInsert:
        print(f"Upserting {len(documentsToInsert)} records into MongoDB...")
        updated_count = 0
        inserted_count = 0
        
        for doc in documentsToInsert:
            # Use student_id, course_name, subject_id AND class_name as the unique filter
            filter_query = {
                "student_id":  doc["student_id"],
                "course_name": doc["course_name"],
                "subject_id":  doc["subject_id"],
                "class_name":  doc["class_name"]
            }
            
            # Use $set to update existing or insert new
            # We don't overwrite created_at if it exists
            update_op = {
                "$set": {
                    "full_name":   doc["full_name"],
                    "email":       doc["email"],
                    "class_name":  doc["class_name"],
                    "status":      doc["status"],
                    "weekly_data": doc["weekly_data"],
                    "updated_at":  doc["updated_at"]
                },
                "$setOnInsert": {
                    "created_at":  doc["created_at"]
                }
            }
            
            res = student_logs.update_one(filter_query, update_op, upsert=True)
            if res.matched_count > 0:
                updated_count += 1
            else:
                inserted_count += 1
                
        print(f"Successfully processed records: {inserted_count} inserted, {updated_count} updated.")
    else:
        print("No valid records found to insert.")

if __name__ == "__main__":
    # Test template generation
    template_path = os.path.join(os.path.dirname(__file__), 'datasets', 'template.csv')
    generate_csv_template(template_path)
    print(f"Template generated at: {template_path}")

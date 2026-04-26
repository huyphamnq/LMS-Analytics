# LMS-Analytics: Learning Management System Analytics

LMS-Analytics là hệ thống phân tích dữ liệu học tập chuyên sâu, được thiết kế để hỗ trợ đội ngũ giảng viên trong việc giám sát tiến trình học tập và nhận diện sớm các sinh viên có nguy cơ học thuật thông qua ứng dụng công nghệ Trí tuệ nhân tạo (ML/AI).

## Các Tính năng Chính
- **Bảng điều khiển Thống kê (Dashboard)**: Cung cấp số liệu tổng quan về hiệu suất học tập của lớp học, bao gồm tỷ lệ sinh viên trong ngưỡng an toàn và các trường hợp cần chú ý.
- **Phân tích Hành vi Chi tiết**: Hệ thống theo dõi và tổng hợp các chỉ số tương tác hàng tuần như tần suất đăng nhập, thời lượng xem video bài giảng, tương tác thảo luận và kết quả bài tập.
- **Dự báo Rủi ro (Early Warning System)**: Tích hợp các mô hình học máy tiên tiến như Logistic Regression, Random Forest và LightGBM để tính toán xác suất rủi ro dựa trên dữ liệu lịch sử.
- **Nhận diện Bất thường**: Sử dụng biểu đồ phân tán (Scatter Plot) để xác định các trường hợp có sự mâu thuẫn giữa nỗ lực tương tác và kết quả điểm số.
- **Tích hợp Trợ lý AI (Gemini AI)**: Hỗ trợ giảng viên giải thích các yếu tố dẫn đến rủi ro học tập và soạn thảo văn bản can thiệp phù hợp cho từng đối tượng sinh viên.

## Công nghệ Sử dụng
- **Backend**: FastAPI (Python), MongoDB Atlas (Database), Scikit-learn, LightGBM.
- **Frontend**: JavaScript (Vanilla), TailwindCSS, Chart.js.
- **AI Integration**: Google Gemini API.

## Hướng dẫn Vận hành Dự án

### 1. Cài đặt Môi trường
Hệ thống yêu cầu Python phiên bản 3.9 trở lên. Để cài đặt các thư viện phụ thuộc, vui lòng thực hiện lệnh sau trong thư mục `backend`:

```bash
cd backend
pip install -r requirements.txt
```

### 2. Cấu hình Mô hình Học máy
Trong trường hợp thư mục `backend/models/` chưa chứa các tệp tin lưu trữ mô hình (.pkl), cần thực thi lệnh sau để khởi tạo:
```bash
python generate_mock_models.py
```

### 3. Khởi chạy Backend Server
Khởi chạy dịch vụ API tại cổng mặc định (8000):
```bash
python app.py
```
Tài liệu hướng dẫn API chi tiết (Swagger UI) có thể truy cập tại: `http://127.0.0.1:8000/docs`

### 4. Khởi chạy Giao diện Người dùng (Frontend)
Frontend bao gồm các tệp tin tĩnh. Để vận hành, có thể sử dụng máy chủ HTTP tích hợp của Python tại thư mục gốc của dự án:
1. Mở terminal mới tại thư mục gốc.
2. Thực thi lệnh:
   ```bash
   python -m http.server 8080
   ```
3. Truy cập địa chỉ: `http://localhost:8080`

## Lưu ý quan trọng
- **Quản lý Dữ liệu**: Hệ thống hiện đang kết nối trực tiếp với MongoDB Atlas. Vui lòng cẩn trọng khi thực thi các tác vụ tác động đến cấu trúc dữ liệu.
- **Cấu hình AI**: Để kích hoạt các tính năng phân tích bằng AI, cần cung cấp **Gemini API Key** thông qua giao diện cấu hình tại Dashboard.
- **Chuẩn Database**: Xem tài liệu schema và index tại [backend/DATABASE_SCHEMA.md](backend/DATABASE_SCHEMA.md).

## Migration sang schema chuẩn hóa

Các script migration nằm trong `backend/scripts/`:

```bash
cd backend
python -m scripts.migrate_normalized_schema
python -m scripts.import_csv_batch --csv datasets/template.csv --imported-by admin@local --semester S1 --year 2026 --dry-run
python -m scripts.import_csv_batch --csv <path_to_csv> --imported-by admin@local --semester S1 --year 2026
python -m scripts.backfill_enrollment_refs
python -m scripts.bootstrap_production_indexes
```

Runbook chi tiết: [backend/MIGRATION_RUNBOOK.md](backend/MIGRATION_RUNBOOK.md)

---
*Dự án LMS-Analytics - Hệ thống hỗ trợ giảng dạy và quản lý đào tạo.*

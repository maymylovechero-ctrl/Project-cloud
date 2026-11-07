# FixFlow

ระบบรับแจ้งและติดตามงานซ่อมสำหรับมหาวิทยาลัย รองรับคอมพิวเตอร์/เครือข่าย เครื่องปรับอากาศ อุปกรณ์นำเสนอ และอุปกรณ์ทั่วไป

## เริ่มใช้งาน

ต้องติดตั้ง Docker Desktop และเปิด Docker Engine ก่อน จากโฟลเดอร์โครงการ รัน:

```powershell
docker compose up --build
```

เปิดเว็บที่ <http://localhost:8080> และ API ที่ <http://localhost:3000/api/health> ฐานข้อมูล PostgreSQL และรูปแนบถูกเก็บใน Docker volumes จึงยังอยู่หลัง restart container

หยุดระบบ: `docker compose down`  |  ลบข้อมูลทั้งหมด: `docker compose down -v`

## ฟังก์ชันที่ทำงานได้

- ผู้ใช้ส่งคำขอซ่อมพร้อมชื่อผู้แจ้ง สถานที่ หมวดหมู่ รายละเอียด และรูปภาพ
- ผู้จัดการมอบหมายช่างจากรายการผู้ปฏิบัติงาน
- ช่างอัปเดตสถานะงานและบันทึกผลซ่อม
- ผู้แจ้งให้คะแนนงานที่เสร็จแล้ว
- API บันทึกข้อมูลลง PostgreSQL และรูปลง persistent volume พร้อม health checks
- Compose มี health checks และ restart policy; Kubernetes manifests มี probes, PVC และ HPA

## โครงสร้าง

```text
frontend/       HTML/CSS/JS เสิร์ฟด้วย Nginx
backend/        Node.js + Express REST API
database/       schema PostgreSQL
deploy/k8s/     manifests สำหรับ Kubernetes
docker-compose.yml
```

## API หลัก

- `GET /api/health` ตรวจสุขภาพ API และ PostgreSQL
- `GET /api/requests` ดูคำขอทั้งหมด (เลือกกรองด้วย `?status=pending` ได้)
- `POST /api/requests` สร้างคำขอ; multipart field `photo` ไม่บังคับ
- `PATCH /api/requests/:id/assignment` มอบหมายช่าง
- `PATCH /api/requests/:id/status` อัปเดตสถานะและบันทึกผลซ่อม
- `POST /api/requests/:id/rating` ให้คะแนน 1–5 ดาว
- `GET /api/technicians` ดูรายชื่อช่าง

## Kubernetes

เตรียมคลัสเตอร์ที่มี metrics-server และ StorageClass ที่รองรับ ReadWriteMany ก่อน แล้วทำตามลำดับใน `deploy/k8s/README.md`. PVC รูปแนบต้องรองรับ ReadWriteMany เมื่อ backend มีหลาย replica; หากคลัสเตอร์รองรับเฉพาะ ReadWriteOnce ให้ใช้ object storage หรือคง backend replica ไว้หนึ่งตัวก่อนเปิด HPA.

## ขอบเขตต้นแบบ

หน้านี้เป็นต้นแบบสำหรับสาธิต workflow ในเครือข่ายที่เชื่อถือได้ ยังไม่มีระบบบัญชีผู้ใช้/การยืนยันตัวตนและการกำหนดสิทธิ์จริง จึงควรเพิ่ม SSO/การยืนยันตัวตน, authorization, audit log, backup/restore, HTTPS, และ object storage ก่อนเปิดให้ใช้งานจริงทั้งมหาวิทยาลัย. CORS ถูกจำกัดตาม `FRONTEND_ORIGIN`.

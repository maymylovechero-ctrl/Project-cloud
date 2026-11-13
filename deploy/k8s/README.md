# ติดตั้ง FixFlow บน Kubernetes

ข้อกำหนด: kubectl เชื่อมคลัสเตอร์ได้, metrics-server เปิดใช้งาน, Container Storage Interface มี StorageClass แบบ `ReadWriteMany` สำหรับรูป, และ image repository ที่คลัสเตอร์ดึง image ได้

## Build และ push images

จาก root ของโครงการ แทน `REGISTRY` ด้วย registry ของกลุ่ม:

```powershell
docker build -t REGISTRY/fixflow-api:1.0 ./backend
docker build -t REGISTRY/fixflow-web:1.0 ./frontend
docker build -t REGISTRY/fixflow-files:1.0 ./file-server
docker push REGISTRY/fixflow-api:1.0
docker push REGISTRY/fixflow-web:1.0
docker push REGISTRY/fixflow-files:1.0
```

แก้ `image` ใน `api.yaml`, `web.yaml` และ `file-server.yaml` ให้ตรงกับ registry จากนั้นตั้งรหัสผ่าน PostgreSQL จริงใน `config.yaml` Secret ก่อนนำไปใช้ โดยเก็บไฟล์ที่มีรหัสผ่านไว้นอก Git

## Apply ตามลำดับ

```powershell
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/config.yaml
kubectl apply -f deploy/k8s/storage.yaml
kubectl apply -f deploy/k8s/database.yaml
kubectl apply -f deploy/k8s/api.yaml
kubectl apply -f deploy/k8s/file-server.yaml
kubectl apply -f deploy/k8s/web.yaml
kubectl apply -f deploy/k8s/hpa.yaml
kubectl -n fixflow get pods,svc,hpa,pvc
```

เข้าใช้งานชั่วคราวโดยใช้ `kubectl -n fixflow port-forward svc/web 8080:80` แล้วเปิด <http://localhost:8080>. `NodePort` 30080 ก็เปิดไว้สำหรับคลัสเตอร์ที่อนุญาตให้เข้าถึง NodePort

## หมายเหตุ

- Image tags เริ่มต้นใน manifests คือ `fixflow-api:1.0`, `fixflow-web:1.0` และ `fixflow-files:1.0`; เปลี่ยนตาม registry ก่อน deploy.
- API เขียนไฟล์ลง PVC `uploaded-photos`; File Server mount PVC เดียวกันแบบอ่านอย่างเดียวและให้บริการไฟล์ผ่าน Service ภายในคลัสเตอร์. PVC ใช้ `ReadWriteMany` เพราะ API และ File Server ต้องเข้าถึงพื้นที่ร่วมกัน. หาก StorageClass ไม่มี RWX ให้ใช้ shared storage ที่คลัสเตอร์รองรับ หรือเปลี่ยนเป็น object storage.
- ตัวอย่าง PostgreSQL เป็น StatefulSet เดี่ยวเพื่อการทดลองในรายวิชา. ระบบจริงควรใช้ managed PostgreSQL, backup และ recovery.
- Probes ทำให้ Kubernetes เริ่ม container ใหม่เมื่อ API หรือฐานข้อมูลไม่ตอบสนอง; HPA ต้องมี metrics-server และ CPU requests จึงจะคำนวณ scaling ได้.

# Niệm Phật Online - bản máy chủ riêng (có tài khoản)

Người chơi tự đăng ký tên đăng nhập + mật khẩu, lần sau đăng nhập lại là còn nguyên dữ liệu
(bậc, exp, túi đồ, trang phục, nhiệm vụ...). Chủ chùa (admin) không cần đăng ký.

## Chạy thử trên máy bạn
1. Cài Node.js 18 trở lên.
2. Trong thư mục này chạy:
   npm install
   ADMIN_KEY=matkhau_quan_tri npm start
   (Windows PowerShell: $env:ADMIN_KEY="matkhau_quan_tri"; npm start)
3. Mở http://localhost:3000

## Đưa lên mạng
Dùng dịch vụ chạy được Node.js + WebSocket (ví dụ Render, Railway, Fly.io; xem điều kiện gói miễn phí hiện tại).
- Cài đặt: `npm install`   Chạy: `npm start`
- Biến môi trường:
  - ADMIN_KEY = mật khẩu quản trị do bạn tự đặt (bắt buộc nếu muốn dùng nút Quản lý/Giám sát)
  - DATA_DIR  = thư mục nằm trên ổ đĩa lưu trữ bền của dịch vụ (RẤT NÊN đặt).
    Nếu không có ổ đĩa bền, tài khoản và dữ liệu sẽ MẤT mỗi lần máy chủ khởi động lại.
- Hãy dùng địa chỉ https:// để mật khẩu được mã hóa khi gửi đi.

## Quản trị
Lần đầu, mở địa chỉ kèm khóa trên máy của bạn: https://dia-chi/?admin=matkhau_quan_tri
Máy nhớ khóa; nút Quản lý và Giám sát hiện ra. Không gửi link có ?admin= cho ai.
- Giám sát > Khóa: người đó không đăng nhập được nữa (khóa theo tài khoản, không né được bằng cách xóa dữ liệu trình duyệt).
- Giám sát > Xóa: xóa hẳn tài khoản và dữ liệu của người đó, tên đăng nhập được giải phóng.

## Bảo mật và giới hạn
- Mật khẩu được băm bằng scrypt kèm muối, không lưu dạng thô. Phiên đăng nhập 30 ngày.
- Mỗi địa chỉ IP chỉ thử đăng ký/đăng nhập tối đa 15 lần mỗi phút.
- Chưa có chức năng quên mật khẩu hay đổi mật khẩu. Người quên mật khẩu cần bạn xóa tài khoản để họ đăng ký lại (mất dữ liệu).
- Dữ liệu lưu trong file data.json, máy chủ chạy một bản duy nhất (không chia nhiều máy).

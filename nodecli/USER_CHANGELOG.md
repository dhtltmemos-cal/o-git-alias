# USER_CHANGELOG — nodecli / ocli

## 2026-04-03 — Thêm subcommand ocli clip — clipboard → file

**Yêu cầu:** Thêm nghiệp vụ đầu tiên cho `ocli clip`: đọc clipboard, nhận diện path trong 3 dòng đầu theo comment `//`, ghi nội dung vào file theo cwd, xử lý trường hợp nhiều path và hỏi chạy tiếp vòng tiếp theo.

### Những gì đã làm

- Tạo mới `nodecli/services/clip/index.js` — triển khai subcommand `clip`, đọc clipboard theo OS (Windows dùng PowerShell `Get-Clipboard -Raw`), parse code fence và path metadata.
- Cập nhật `nodecli/bin/ocli.js` — đăng ký subcommand `clip` trong router `SUBCOMMANDS` và help text.
- Cập nhật `nodecli/README.md` — bổ sung tài liệu cấu trúc + hướng dẫn sử dụng `ocli clip`.
- Cập nhật `nodecli/ProjectStructure.md` — thêm cây thư mục cho service `clip`.

---

Lịch sử thay đổi, entry mới nhất ở đầu file.

---

## 2026-04-02 — Thêm subcommand ocli azure — Azure Pipeline Variables

**Yêu cầu:** Thêm dịch vụ Azure DevOps để quản lý pipeline variables, tương tự secrets của GitHub. Dùng REST API trực tiếp, không cần cài thêm CLI.

**Mục đích:** Cho phép thêm/xem/xóa variables của Azure Pipeline từ CLI, đọc auth từ .git-o-config, hỗ trợ set hàng loạt từ file JSON hoặc .env.

**Thay đổi:**
- Tạo mới nodecli/lib/azureApi.js — helper gọi Azure DevOps REST API qua https built-in, tự build Basic auth từ token hoặc header trong config
- Tạo mới nodecli/services/azure/index.js — subcommand azure: chọn account → project → pipeline → nghiệp vụ
- Tạo mới nodecli/services/azure/variables.js — list/set/set-from-file/delete pipeline variables; PUT toàn bộ definition (theo yêu cầu của Azure API)
- Tạo mới nodecli/templates/azure-pipeline-vars.json — template JSON hỗ trợ cả string lẫn object có isSecret/allowOverride
- Tạo mới nodecli/templates/azure-pipeline-vars.env.example — template .env (isSecret=false)
- Cập nhật nodecli/bin/ocli.js — kích hoạt subcommand azure
- Cập nhật nodecli/README.md — thêm hướng dẫn azure
- Cập nhật nodecli/ProjectStructure.md — thêm azure vào sơ đồ, bảng phụ thuộc, danh sách file ZIP
- Cập nhật nodecli/DeveloperGuide.vi.md — thêm azureApi vào mục lib

---

## 2026-04-02 — Khởi tạo nodecli với subcommand ocli gh

**Yêu cầu:** Tạo thư mục nodecli/ để chứa code Node.js thực hiện API tới các hệ thống bên ngoài, sử dụng lại cấu hình .git-o-config. Dịch vụ đầu tiên là gh — quản lý GitHub repo secrets.

**Mục đích:** Bổ sung khả năng tự động hóa các thao tác API mà bash alias không tiện xử lý trực tiếp.

**Thay đổi:**
- Tạo mới nodecli/package.json
- Tạo mới nodecli/bin/ocli.js
- Tạo mới nodecli/lib/config.js
- Tạo mới nodecli/lib/prompt.js
- Tạo mới nodecli/lib/shell.js
- Tạo mới nodecli/services/gh/index.js
- Tạo mới nodecli/services/gh/secrets.js
- Tạo mới nodecli/templates/gh-secrets.json
- Tạo mới nodecli/templates/gh-secrets.env.example
- Tạo mới nodecli/README.md
- Tạo mới nodecli/DeveloperGuide.vi.md
- Tạo mới nodecli/ProjectStructure.md
- Tạo mới nodecli/USER_CHANGELOG.md

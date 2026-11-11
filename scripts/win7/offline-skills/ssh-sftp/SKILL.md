---
name: ssh-sftp
description: 从 Win7 内网电脑通过 SSH 执行 Linux 命令、交互终端和 SFTP 上传下载；使用随包 PuTTY、Plink、PSFTP，无需远端联网安装。
---

# SSH / SFTP

`ZCODE_OFFLINE_TOOLS` 指向只读工具包根目录，可用 `python -c "import os; print(os.environ['ZCODE_OFFLINE_TOOLS'])"` 查询。

随包工具在应用 PATH：`putty.exe`（交互 SSH）、`plink.exe`（命令）、`psftp.exe`（文件传输）、`pscp.exe`、`puttygen.exe`、`pageant.exe`。以原 Bash/终端权限运行，不另起远端 ZCode 服务。

1. 取得目标主机、端口、用户名、身份凭据，以及管理员通过可信渠道提供的 SSH 主机 SHA256 指纹。不要凭第一次扫描结果自动建立信任；指纹变化停止并核实。
2. 自动化必须使用 `-batch -hostkey "SHA256:..."`，连接失败原样报告。不得用 `echo y`、关闭验证或改弱加密绕过错误。
3. 密码由用户在交互终端输入，不写命令行/脚本/日志；自动化使用用户的 PPK 密钥或 Pageant。OpenSSH 私钥可由用户用 PuTTYgen 导入另存 PPK，不覆盖原私钥；不要把密钥内容发送到模型。
4. 先用只读命令验证身份和路径。删除/覆盖/重启/提权等按用户授权范围及现有执行审批处理。上传默认使用新文件名，核对大小/摘要后再由用户要求替换。

以下是 CMD 示例；从用户输入生成实际命令时正确转义参数，不将未知文本拼成远端 shell 命令。

```bat
plink.exe -ssh -batch -P 22 -l demo -hostkey "SHA256:管理员确认的指纹" -i "C:\Keys\work.ppk" server.example.internal "uname -a"
psftp.exe -batch -P 22 -l demo -hostkey "SHA256:管理员确认的指纹" -i "C:\Keys\work.ppk" -b "C:\Work\transfer.txt" server.example.internal
```

`transfer.txt` 内容（路径按实际替换；批处理遇到错误必须失败，不使用 `-be` 忽略错误）：

```text
pwd
ls
put "C:\Work\report.docx" /tmp/report-new.docx
get /tmp/report-new.docx "C:\Work\report-roundtrip.docx"
quit
```

用 Python hashlib 核对上传前与下载后的摘要。交互操作用 `putty.exe -ssh -P 22 -l demo server.example.internal`，由用户确认已核实的主机指纹并输入密码。端口转发仅在用户明确要求时配置。

此能力是 SSH/SFTP 客户端；应用“远程工作区”仍要求安装其匹配的 Linux Server/Agent 资源，不能声称两者已一起离线部署。

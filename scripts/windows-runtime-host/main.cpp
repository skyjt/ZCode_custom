#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <cstdio>
#include <cwchar>
#include <string>
#include <vector>

namespace {
constexpr ULONGLONG kGraceMs = 1800;
struct Handle {
  HANDLE value = nullptr;
  ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
  void close() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); value = nullptr; }
};
bool send(HANDLE pipe, const std::string& message) {
  const auto frame = message + "\n";
  DWORD count;
  return WriteFile(pipe, frame.data(), static_cast<DWORD>(frame.size()), &count, nullptr) && count == frame.size();
}
std::wstring quote(const std::wstring& arg) {
  std::wstring result = L"\"";
  size_t slashes = 0;
  for (const auto c : arg) {
    if (c == L'\\') { ++slashes; continue; }
    result.append(slashes * (c == L'"' ? 2 : 1), L'\\');
    slashes = 0;
    if (c == L'"') result += L'\\';
    result += c;
  }
  result.append(slashes * 2, L'\\');
  return result + L'"';
}
int fail(const char* stage) {
  std::fprintf(stderr, "[windows-runtime-host] %s failed (%lu)\n", stage, GetLastError());
  return 1;
}

// Win7 不支持 JOB_LIST；bootstrap 先把自己归组，再由内核把 CLI 继承到同一 Job。
// supervisor 若在归组前退出，bootstrap 关闭继承的最后一个 Job 句柄会终止自己，不能遗留 CLI。
bool createWithHandles(std::wstring command, const std::vector<HANDLE>& handles,
                       DWORD flags, PROCESS_INFORMATION& pi) {
  SIZE_T size = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
  std::vector<unsigned char> storage(size);
  auto attrs = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  if (!InitializeProcThreadAttributeList(attrs, 1, 0, &size)) return false;
  BOOL ok = UpdateProcThreadAttribute(attrs, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
      const_cast<HANDLE*>(handles.data()), handles.size() * sizeof(HANDLE), nullptr, nullptr);
  if (ok) {
    STARTUPINFOEXW si{};
    si.StartupInfo.cb = sizeof(si);
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput = handles[0];
    si.StartupInfo.hStdOutput = handles[1];
    si.StartupInfo.hStdError = handles[2];
    si.lpAttributeList = attrs;
    ok = CreateProcessW(nullptr, command.data(), nullptr, nullptr, TRUE,
        flags | EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, nullptr, nullptr, &si.StartupInfo, &pi);
  }
  const DWORD error = GetLastError();
  DeleteProcThreadAttributeList(attrs);
  SetLastError(error);
  return ok != FALSE;
}

struct BootstrapResult { HANDLE process; HANDLE thread; DWORD pid; };

int bootstrap(int argc, wchar_t** argv) {
  if (argc < 6) return fail("bootstrap arguments");
  Handle job{reinterpret_cast<HANDLE>(wcstoull(argv[2], nullptr, 10))};
  Handle supervisor{reinterpret_cast<HANDLE>(wcstoull(argv[3], nullptr, 10))};
  Handle resultPipe{reinterpret_cast<HANDLE>(wcstoull(argv[4], nullptr, 10))};
  if (WaitForSingleObject(supervisor.value, 0) != WAIT_TIMEOUT ||
      !AssignProcessToJobObject(job.value, GetCurrentProcess())) return fail("bootstrap self-assign");
  job.close();
  std::wstring command;
  for (int i = 5; i < argc; ++i) command += (i == 5 ? L"" : L" ") + quote(argv[i]);
  PROCESS_INFORMATION pi{};
  if (!createWithHandles(command, {GetStdHandle(STD_INPUT_HANDLE), GetStdHandle(STD_OUTPUT_HANDLE),
      GetStdHandle(STD_ERROR_HANDLE)}, CREATE_SUSPENDED, pi)) return fail("bootstrap create CLI");
  Handle root{pi.hProcess}, thread{pi.hThread};
  BootstrapResult result{};
  result.pid = pi.dwProcessId;
  if (!DuplicateHandle(GetCurrentProcess(), root.value, supervisor.value, &result.process,
                       0, FALSE, DUPLICATE_SAME_ACCESS) ||
      !DuplicateHandle(GetCurrentProcess(), thread.value, supervisor.value, &result.thread,
                       0, FALSE, DUPLICATE_SAME_ACCESS)) return fail("bootstrap transfer handles");
  DWORD written = 0;
  if (!WriteFile(resultPipe.value, &result, sizeof(result), &written, nullptr) || written != sizeof(result))
    return fail("bootstrap result");
  return 0;
}

bool createLegacyCli(HANDLE job, const HANDLE (&stdioHandles)[3], const std::wstring& command,
                     PROCESS_INFORMATION& pi) {
  Handle inheritedJob, supervisor, reader, writer;
  if (!DuplicateHandle(GetCurrentProcess(), job, GetCurrentProcess(), &inheritedJob.value,
      JOB_OBJECT_ASSIGN_PROCESS, TRUE, 0) ||
      !DuplicateHandle(GetCurrentProcess(), GetCurrentProcess(), GetCurrentProcess(), &supervisor.value,
      PROCESS_DUP_HANDLE | SYNCHRONIZE, TRUE, 0)) return false;
  SECURITY_ATTRIBUTES sa{sizeof(sa), nullptr, TRUE};
  if (!CreatePipe(&reader.value, &writer.value, &sa, 0) ||
      !SetHandleInformation(reader.value, HANDLE_FLAG_INHERIT, 0)) return false;
  wchar_t path[32768];
  const auto length = GetModuleFileNameW(nullptr, path, 32768);
  if (!length || length >= 32768) return false;
  const auto handleArg = [](HANDLE h) { return std::to_wstring(reinterpret_cast<ULONG_PTR>(h)); };
  auto childCommand = quote(path) + L" --bootstrap " + handleArg(inheritedJob.value) + L" " +
      handleArg(supervisor.value) + L" " + handleArg(writer.value) + L" " + command;
  BOOL inJob = FALSE;
  if (!IsProcessInJob(GetCurrentProcess(), nullptr, &inJob)) return false;
  PROCESS_INFORMATION boot{};
  if (!createWithHandles(childCommand, {stdioHandles[0], stdioHandles[1], stdioHandles[2],
      inheritedJob.value, supervisor.value, writer.value}, inJob ? CREATE_BREAKAWAY_FROM_JOB : 0, boot)) return false;
  Handle bootProcess{boot.hProcess}, bootThread{boot.hThread};
  inheritedJob.close(); writer.close(); supervisor.close();
  if (WaitForSingleObject(bootProcess.value, 10000) != WAIT_OBJECT_0) {
    // 这里只界定启动失败；归属仍由 Job 句柄维持，不能把超时当作 Job 已清空。
    TerminateProcess(bootProcess.value, 1);
    WaitForSingleObject(bootProcess.value, INFINITE);
    SetLastError(ERROR_TIMEOUT); return false;
  }
  DWORD code = 1, count = 0, available = 0;
  BootstrapResult result{};
  if (!GetExitCodeProcess(bootProcess.value, &code) || code != 0 ||
      !PeekNamedPipe(reader.value, nullptr, 0, nullptr, &available, nullptr) || available != sizeof(result) ||
      !ReadFile(reader.value, &result, sizeof(result), &count, nullptr) || count != sizeof(result)) return false;
  pi.hProcess = result.process; pi.hThread = result.thread; pi.dwProcessId = result.pid;
  return true;
}
}

int wmain(int argc, wchar_t** argv) {
  if (argc > 1 && std::wstring(argv[1]) == L"--bootstrap") return bootstrap(argc, argv);
  if (argc == 2 && std::wstring(argv[1]) == L"--version") {
    std::puts("zcode-runtime-host 1"); return 0;
  }
  if (argc == 3 && std::wstring(argv[1]) == L"--check-empty") {
    Handle previous{OpenJobObjectW(JOB_OBJECT_QUERY, FALSE, argv[2])};
    // 内核在最后一个句柄关闭且全部成员退出后销毁 Job；不存在是原 Job 已消失的事实。
    if (!previous.value) return GetLastError() == ERROR_FILE_NOT_FOUND ? 0 : fail("open previous Job");
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
    if (!QueryInformationJobObject(previous.value, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), nullptr)) return fail("previous Job membership");
    return accounting.ActiveProcesses == 0 ? 0 : 2;
  }
  if (argc < 5) return fail("arguments");
  const DWORD parentPid = wcstoul(argv[2], nullptr, 10);
  Handle parent{OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, parentPid)};
  if (!parent.value) return fail("parent handle");
  Handle control{CreateFileW(argv[1], GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, 0, nullptr)};
  if (control.value == INVALID_HANDLE_VALUE) return fail("control pipe");
  ULONG serverPid = 0;
  if (!GetNamedPipeServerProcessId(control.value, &serverPid) || serverPid != parentPid ||
      WaitForSingleObject(parent.value, 0) != WAIT_TIMEOUT) return fail("control owner");

  Handle job{CreateJobObjectW(nullptr, argv[3])};
  if (!job.value || GetLastError() == ERROR_ALREADY_EXISTS) return fail("create unique Job");
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) return fail("configure Job");

  // 原因：spawn 后再 attach 有派生窗口，退出后按 PPID 补查又可能误认复用的 PID。
  // 只传递三条 stdio，并通过创建属性加入 Job，避免 helper 在 create/assign 之间崩溃。
  // CLI 在 Host 接管前始终保持 suspended；Win7 通过已归组的 bootstrap 内核继承。
  Handle input, output, error;
  HANDLE inherited[3];
  Handle* copies[] = {&input, &output, &error};
  const DWORD ids[] = {STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE};
  for (int i = 0; i < 3; ++i) {
    if (!DuplicateHandle(GetCurrentProcess(), GetStdHandle(ids[i]), GetCurrentProcess(),
                         &copies[i]->value, 0, TRUE, DUPLICATE_SAME_ACCESS)) return fail("stdio handles");
    inherited[i] = copies[i]->value;
  }
  SIZE_T size = 0;
  InitializeProcThreadAttributeList(nullptr, 2, 0, &size);
  std::vector<unsigned char> storage(size);
  auto attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  if (!InitializeProcThreadAttributeList(attributes, 2, 0, &size)) return fail("handle list");
  if (!UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                                  inherited, sizeof(inherited), nullptr, nullptr)) {
    DeleteProcThreadAttributeList(attributes); return fail("inherit list");
  }
  bool legacy = false;
#ifdef ZCODE_FORCE_LEGACY_JOB
  legacy = true;
#else
  if (!UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
                                  &job.value, sizeof(job.value), nullptr, nullptr)) {
    const auto error = GetLastError();
    if (error != ERROR_NOT_SUPPORTED && error != ERROR_INVALID_PARAMETER) {
      DeleteProcThreadAttributeList(attributes); return fail("creation Job attribute");
    }
    legacy = true;
  }
#endif
  STARTUPINFOEXW si{};
  si.StartupInfo.cb = sizeof(si);
  si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  si.StartupInfo.hStdInput = input.value;
  si.StartupInfo.hStdOutput = output.value;
  si.StartupInfo.hStdError = error.value;
  si.lpAttributeList = attributes;
  std::wstring command;
  for (int i = 4; i < argc; ++i) {
    if (i > 4) command += L' ';
    command += quote(argv[i]);
  }
  PROCESS_INFORMATION pi{};
  const BOOL created = legacy ? createLegacyCli(job.value, inherited, command, pi) :
      CreateProcessW(nullptr, command.data(), nullptr, nullptr, TRUE,
      CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW,
      nullptr, nullptr, &si.StartupInfo, &pi);
  const DWORD createError = GetLastError();
  DeleteProcThreadAttributeList(attributes);
  if (!created) { SetLastError(createError); return fail("create suspended CLI"); }
  Handle root{pi.hProcess}, primaryThread{pi.hThread};
  BOOL assigned = FALSE;
  if (!IsProcessInJob(root.value, job.value, &assigned) || !assigned) {
    TerminateProcess(root.value, 1);
    return fail("verify creation Job ownership");
  }
  bool start = false, close = false, lost = false;
  std::string controlLine;
  bool running = false, rootExited = false, forced = false;
  ULONGLONG closeAt = 0;
  const auto startupDeadline = GetTickCount64() + 10000;
  if (!send(control.value, "ready " + std::to_string(pi.dwProcessId))) lost = true;
  int result = 0;
  for (;;) {
    DWORD available = 0;
    if (!lost && !PeekNamedPipe(control.value, nullptr, 0, nullptr, &available, nullptr)) lost = true;
    while (!lost && available-- > 0) {
      char c; DWORD count;
      if (!ReadFile(control.value, &c, 1, &count, nullptr) || count != 1) { lost = true; break; }
      if (c == '\n') {
        if (controlLine == "start") start = true;
        else if (controlLine == "close") close = true;
        else lost = true;
        controlLine.clear();
      } else if (controlLine.size() < 32) controlLine += c;
      else lost = true;
    }
    const auto now = GetTickCount64();
    const bool abandoned = lost || WaitForSingleObject(parent.value, 0) == WAIT_OBJECT_0;
    if (!running && start && !close && !abandoned) {
      if (ResumeThread(primaryThread.value) == static_cast<DWORD>(-1)) { result = fail("resume CLI"); break; }
      running = true;
      if (!send(control.value, "started")) lost = true;
    }
    if (!rootExited && WaitForSingleObject(root.value, 0) == WAIT_OBJECT_0) {
      rootExited = true;
      DWORD code;
      if (!GetExitCodeProcess(root.value, &code)) { result = fail("root exit status"); break; }
      if (!lost && !send(control.value, "root " + std::to_string(code))) lost = true;
    }
    if (close && closeAt == 0) closeAt = now;
    // 根退出表示它已完成自身收尾；残余成员仍归 Job，不能因根 PID 消失释放所有权。
    const bool mustTerminate = abandoned || rootExited || (!running && (close || now >= startupDeadline)) ||
                              (closeAt != 0 && now - closeAt >= kGraceMs);
    if (mustTerminate && !forced) {
      if (!TerminateJobObject(job.value, 1)) { result = fail("terminate Job"); break; }
      forced = true;
    }
    if (rootExited) {
      JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
      if (!QueryInformationJobObject(job.value, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), nullptr)) {
        result = fail("query Job membership"); break;
      }
      if (accounting.ActiveProcesses == 0 && rootExited) {
        if (!lost) send(control.value, "empty");
        break;
      }
    }
    // 等待句柄事件；短轮询只复核内核 Job 计数，不枚举系统进程，也不把超时当清空。
    HANDLE waits[] = {parent.value, root.value};
    if (abandoned) Sleep(50);
    else WaitForMultipleObjects(rootExited ? 1 : 2, waits, FALSE, 50);
  }
  // 异常退出仍由最后一个 Job 句柄负责强制回收。
  return result;
}

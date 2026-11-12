# Fixed worker, called only through office_native.py. PowerShell 2.0 / .NET 3.5.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Web.Extensions
$serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer

function Release-Com($value) {
    if ($null -ne $value -and [Runtime.InteropServices.Marshal]::IsComObject($value)) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($value)
    }
}

function Invoke-NativeOffice($request) {
    $classes = @{ word = 'Word.Application'; excel = 'Excel.Application'; powerpoint = 'PowerPoint.Application' }
    if ($request.action -eq 'probe') {
        $components = @{}
        foreach ($name in $classes.Keys) {
            $components[$name] = $null -ne [Type]::GetTypeFromProgID($classes[$name])
        }
        return @{ components = $components; status = 'registered-only; conversion not tested' }
    }
    $kind = [string]$request.application
    if (!$classes.ContainsKey($kind) -or @('convert', 'pdf', 'recalc') -notcontains $request.action) {
        throw 'Invalid Office request'
    }
    $processNames = @{ word = 'WINWORD'; excel = 'EXCEL'; powerpoint = 'POWERPNT' }
    $sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
    $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $mutex = New-Object System.Threading.Mutex -ArgumentList @($false, "Local\aibuddy7se-office-$userSid-$kind")
    $locked = $false
    $app = $null
    $documents = $null
    $document = $null
    $wordOptions = $null
    $ownedInstance = $false
    $oldSecurity = $null
    $oldAlerts = $null
    $oldUpdateLinks = $null
    try {
        try { $locked = $mutex.WaitOne(0) }
        catch [Threading.AbandonedMutexException] { $locked = $true }
        if (!$locked) { throw "Another $kind operation is running; wait for it to finish" }
        $running = @(Get-Process -Name $processNames[$kind] -ErrorAction SilentlyContinue |
            Where-Object { $_.SessionId -eq $sessionId })
        if ($running.Count -gt 0) {
            throw "Save and close $kind before running this tool; existing Office windows are never controlled"
        }
        if ($null -eq [Type]::GetTypeFromProgID($classes[$kind])) {
            throw "Microsoft $kind is not installed or its COM registration is unavailable"
        }
        $app = New-Object -ComObject $classes[$kind]
        switch ($kind) {
            'word' { $documents = $app.Documents }
            'excel' { $documents = $app.Workbooks }
            'powerpoint' { $documents = $app.Presentations }
        }
        # PowerPoint 可能复用进程；有既有文档时绝不设置全局属性或调用 Quit。
        if ($documents.Count -ne 0) { throw 'Office instance already contains documents; refusing to take ownership' }
        $ownedInstance = $true
        $version = [string]$app.Version
        $oldSecurity = $app.AutomationSecurity
        $oldAlerts = $app.DisplayAlerts
        $app.AutomationSecurity = 3
        $missing = [Type]::Missing
        $noPassword = [Guid]::NewGuid().ToString()
        switch ($kind) {
            'word' {
                $app.Visible = $false
                $app.DisplayAlerts = 0
                $wordOptions = $app.Options
                $oldUpdateLinks = $wordOptions.UpdateLinksAtOpen
                $wordOptions.UpdateLinksAtOpen = $false
                $document = $documents.Open($request.input, $false, $true, $false,
                    $noPassword, $missing, $false, $noPassword, $missing, $missing,
                    $missing, $false, $false, $missing, $true)
                if ($request.action -eq 'convert') {
                    if ($document.HasVBProject) { throw 'VBA document cannot be converted to macro-free DOCX' }
                    $document.SaveAs2($request.output, 12)
                } else {
                    $document.ExportAsFixedFormat($request.output, 17)
                }
            }
            'excel' {
                $app.Visible = $false
                $app.DisplayAlerts = $false
                $document = $documents.Open($request.input, 0, $true, $missing, $noPassword, $noPassword, $true)
                $macroSheets = $null
                $intlMacroSheets = $null
                try {
                    $macroSheets = $document.Excel4MacroSheets
                    $intlMacroSheets = $document.Excel4IntlMacroSheets
                    # ForceDisable 不覆盖 Excel 4.0 宏；不对这类工作簿执行重算或无宏转换。
                    if ($macroSheets.Count -gt 0 -or $intlMacroSheets.Count -gt 0) {
                        throw 'Excel 4.0 macro workbooks are not supported'
                    }
                } finally {
                    Release-Com $macroSheets
                    Release-Com $intlMacroSheets
                }
                if ($request.action -ne 'pdf' -and $document.HasVBProject) {
                    throw 'VBA workbook cannot be saved as macro-free XLSX'
                }
                $app.CalculateFullRebuild()
                while ($app.CalculationState -ne 0) { Start-Sleep -Milliseconds 100 }
                if ($request.action -eq 'pdf') {
                    $document.ExportAsFixedFormat(0, $request.output)
                } else {
                    $document.SaveAs($request.output, 51)
                }
            }
            'powerpoint' {
                $app.DisplayAlerts = 1
                $document = $documents.Open($request.input, -1, 0, 0)
                if ($request.action -eq 'convert') {
                    if ($document.HasVBProject) { throw 'VBA presentation cannot be converted to macro-free PPTX' }
                    $document.SaveAs($request.output, 24)
                } else {
                    $document.SaveAs($request.output, 32)
                }
            }
        }
        return @{ application = $kind; version = $version }
    } finally {
        $cleanupFailure = $null
        if ($null -ne $document) {
            try {
                switch ($kind) {
                    'word' { $document.Close(0) }
                    'excel' { $document.Close($false) }
                    'powerpoint' { $document.Saved = -1; $document.Close() }
                }
            } catch { $cleanupFailure = $_.Exception.Message }
            finally { Release-Com $document }
        }
        try {
            if ($null -ne $oldUpdateLinks) { $wordOptions.UpdateLinksAtOpen = $oldUpdateLinks }
            if ($null -ne $oldSecurity) { $app.AutomationSecurity = $oldSecurity }
            if ($null -ne $oldAlerts) { $app.DisplayAlerts = $oldAlerts }
            if ($ownedInstance -and $null -ne $documents -and $documents.Count -eq 0) { $app.Quit() }
        } catch { $cleanupFailure = $_.Exception.Message }
        finally {
            Release-Com $wordOptions
            Release-Com $documents
            Release-Com $app
            if ($locked) { $mutex.ReleaseMutex() }
            $mutex.Close()
        }
        if ($null -ne $cleanupFailure) { throw "Office cleanup failed: $cleanupFailure" }
    }
}

try {
    $request = $serializer.DeserializeObject([Text.Encoding]::UTF8.GetString(
        [Convert]::FromBase64String($env:ZCODE_OFFICE_REQUEST)))
    $result = Invoke-NativeOffice $request
    [Console]::Out.WriteLine($serializer.Serialize($result))
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}

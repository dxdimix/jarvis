# ディミの「右 Ctrl を 2 回」を見張る（Windows のみ。常駐プログラムが画面なしで起動する）。
# どの画面が前にあっても反応する。右 Ctrl だけを短く 2 回続けて押したら、標準出力に DOUBLE と書く。
# 押したキーの中身は記録も送信もしない（右 Ctrl かどうかだけを見る）。
# 起動した常駐プログラム（-ParentId）が終わったら、これも終わる。
param([int]$ParentId = 0)

Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class DimyHotkey {
  const int WH_KEYBOARD_LL = 13;
  const int WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_SYSKEYDOWN = 0x104, WM_SYSKEYUP = 0x105;
  const int VK_RCONTROL = 0xA3;
  const int MAX_HOLD_MS = 350;  // これより長く押したら「押しっぱなし」とみなす
  const int MAX_GAP_MS = 450;   // 1 回目と 2 回目の間がこれより長ければ数え直す

  delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);

  static HookProc proc = Callback; // 消されないように持っておく
  static IntPtr hook;
  static bool down;
  static bool otherKey;
  static long downAt, lastTapAt;

  static IntPtr Callback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      int vk = Marshal.ReadInt32(lParam);
      int msg = wParam.ToInt32();
      long now = DateTime.UtcNow.Ticks / 10000;
      bool isDown = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
      bool isUp = msg == WM_KEYUP || msg == WM_SYSKEYUP;
      if (vk == VK_RCONTROL) {
        if (isDown && !down) { down = true; otherKey = false; downAt = now; }
        else if (isUp && down) {
          down = false;
          bool tap = !otherKey && now - downAt <= MAX_HOLD_MS;
          if (!tap) lastTapAt = 0;
          else if (lastTapAt > 0 && downAt - lastTapAt <= MAX_GAP_MS) {
            lastTapAt = 0;
            Console.Out.WriteLine("DOUBLE");
            Console.Out.Flush();
          } else lastTapAt = now;
        }
      } else if (isDown) {
        // 右 Ctrl と一緒に別のキーを押した（Ctrl + C など）。数え直す
        otherKey = true;
        lastTapAt = 0;
      }
    }
    return CallNextHookEx(hook, nCode, wParam, lParam);
  }

  public static void Run(int parentId) {
    hook = SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(null), 0);
    if (hook == IntPtr.Zero) { Console.Out.WriteLine("ERROR hook"); Console.Out.Flush(); return; }
    Console.Out.WriteLine("READY");
    Console.Out.Flush();
    if (parentId > 0) {
      var timer = new Timer { Interval = 3000 };
      timer.Tick += (s, e) => {
        try { if (Process.GetProcessById(parentId).HasExited) Application.Exit(); }
        catch { Application.Exit(); }
      };
      timer.Start();
    }
    Application.Run();
  }
}
"@

[DimyHotkey]::Run($ParentId)

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_startuplog_h
#define mozilla_startuplog_h

#include <vector>

#include "mozilla/Logging.h"
#include "mozilla/Printf.h"

class nsIFile;

namespace mozilla {

class StartupLog {
 public:
  ~StartupLog();

  static void SetLogDirectory(nsIFile* aDir);
  static void StartupComplete();
  static void FlushToDisk();
  static void LogPrint(const LogModule* aModule, LogLevel aLevel,
                       const char* aFmt, ...);

 private:
  static StartupLog* GetInstance();
  void Printv(const char* aName, LogLevel aLevel, const char* aFmt,
              va_list aArgs);
  void WriteLogFile();

  static StartupLog* mInstance;
  static bool mStartupComplete;

  FILE* mLogFile = nullptr;
  std::vector<mozilla::SmprintfPointer> mLogBuffer;
};

}  // namespace mozilla

// Call to log a message that may be relevant for tracking startup issues.
#define MOZ_STARTUP_LOG(_module, _level, _args)                 \
  do {                                                          \
    const ::mozilla::LogModule* moz_real_module = _module;      \
    ::mozilla::StartupLog::LogPrint(moz_real_module, _level,    \
                                    MOZ_LOG_EXPAND_ARGS _args); \
    if (MOZ_LOG_TEST(moz_real_module, _level)) {                \
      mozilla::detail::log_print(moz_real_module, _level,       \
                                 MOZ_LOG_EXPAND_ARGS _args);    \
    }                                                           \
  } while (0)

// Call to log a message that something unexpected happened during startup. This
// will cause all startup logged messages to be flushed to a log file on disk.
#define MOZ_STARTUP_LOG_FLUSH(_module, _level, _args) \
  do {                                                \
    MOZ_STARTUP_LOG(_module, _level, _args);          \
    ::mozilla::StartupLog::FlushToDisk();             \
  } while (0)

#endif  // mozilla_startuplog_h

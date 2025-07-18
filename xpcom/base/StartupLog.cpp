/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/Printf.h"
#include "mozilla/StartupLog.h"
#include "nsCOMPtr.h"
#include "nsIFile.h"
#include "prtime.h"

namespace mozilla {

StartupLog* StartupLog::mInstance = nullptr;
bool StartupLog::mStartupComplete = false;
static nsIFile* sLogDirectory = nullptr;

StartupLog* StartupLog::GetInstance() {
  if (mStartupComplete) {
    return nullptr;
  }

  if (!mInstance) {
    mInstance = new StartupLog();
  }
  return mInstance;
}

StartupLog::~StartupLog() {
  if (mLogFile) {
    fclose(mLogFile);
  }
}

void StartupLog::SetLogDirectory(nsIFile* aDir) {
  NS_IF_RELEASE(sLogDirectory);
  NS_IF_ADDREF(sLogDirectory = aDir);
}

void StartupLog::WriteLogFile() {
  if (!sLogDirectory) {
    return;
  }

  nsCOMPtr<nsIFile> logDir;
  nsresult rv = sLogDirectory->Clone(getter_AddRefs(logDir));
  NS_ENSURE_SUCCESS_VOID(rv);

  rv = logDir->AppendNative(nsLiteralCString("Startup Logs"));
  NS_ENSURE_SUCCESS_VOID(rv);

  rv = logDir->Create(nsIFile::DIRECTORY_TYPE, 0700);
  NS_ENSURE_SUCCESS_VOID(rv);

  PRExplodedTime explodedTime;
  PR_ExplodeTime(PR_Now(), PR_LocalTimeParameters, &explodedTime);

  nsCString filename;
  filename.AppendPrintf("startup-%04d%02d%02d-%02d%02d%02d.log",
                        explodedTime.tm_year, explodedTime.tm_month + 1,
                        explodedTime.tm_mday, explodedTime.tm_hour,
                        explodedTime.tm_min, explodedTime.tm_sec);

  rv = logDir->AppendNative(filename);
  NS_ENSURE_SUCCESS_VOID(rv);

  rv = logDir->OpenANSIFileDesc("w", &mLogFile);
  NS_ENSURE_SUCCESS_VOID(rv);

  for (const auto& entry : mLogBuffer) {
    fprintf(mLogFile, "%s\n", entry.get());
  }

  mLogBuffer.clear();
}

void StartupLog::StartupComplete() {
  mStartupComplete = true;

  delete mInstance;
  mInstance = nullptr;
}

void StartupLog::FlushToDisk() {
  if (mInstance) {
    mInstance->WriteLogFile();
  }
}

void StartupLog::LogPrint(const LogModule* aModule, LogLevel aLevel,
                          const char* aFmt, ...) {
  StartupLog* startupLog = GetInstance();
  if (!startupLog) {
    return;
  }

  va_list ap;
  va_start(ap, aFmt);
  startupLog->Printv(aModule->Name(), aLevel, aFmt, ap);
  va_end(ap);
}

void StartupLog::Printv(const char* aName, LogLevel aLevel, const char* aFmt,
                        va_list aArgs) {
  SmprintfPointer allocatedBuff = mozilla::Vsmprintf(aFmt, aArgs);
  if (mLogFile) {
    fprintf(mLogFile, "%s\n", allocatedBuff.get());
    fflush(mLogFile);
  } else {
    mLogBuffer.push_back(std::move(allocatedBuff));
  }
}

}  // namespace mozilla

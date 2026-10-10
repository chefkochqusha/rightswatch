"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonStyles } from "@/components/ui/button";

/**
 * Uploads one file straight to an upload endpoint (`/api/uploads/...`),
 * with progress. The body is the file itself, not a form, so the server
 * can stream it to disk; the custom header marks the request as coming
 * from Bekvor's own page (see `app/_lib/upload-request.ts`). When the
 * server has accepted it, the page's data is refreshed.
 */
export function FileUpload({
  endpoint,
  label,
  hint,
  maxBytes,
  accept = "audio/*,video/*",
}: {
  endpoint: string;
  label: string;
  hint: string;
  maxBytes: number;
  accept?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  function upload(file: File) {
    setMessage(null);
    if (file.size > maxBytes) {
      setMessage({ tone: "error", text: `That file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.` });
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("x-bekvor-upload", "1");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (input.current) input.current.value = "";
      if (xhr.status === 202) {
        setMessage({ tone: "ok", text: "Uploaded. Bekvor is processing it now." });
        router.refresh();
        return;
      }
      let text = "The upload didn't work. Please try again.";
      try {
        text = (JSON.parse(xhr.responseText) as { error?: string }).error ?? text;
      } catch {
        /* keep the default */
      }
      setMessage({ tone: "error", text });
    };
    xhr.onerror = () => {
      setProgress(null);
      setMessage({ tone: "error", text: "The connection broke off during the upload. Please try again." });
    };
    setProgress(0);
    xhr.send(file);
  }

  return (
    <div className="mt-4">
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={accept}
        className="peer sr-only"
        disabled={progress !== null}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3 peer-focus-visible:[&>label]:outline-2 peer-focus-visible:[&>label]:outline-offset-2 peer-focus-visible:[&>label]:outline-accent">
        <label
          htmlFor={inputId}
          className={`${buttonStyles("secondary")} cursor-pointer ${progress !== null ? "pointer-events-none opacity-60" : ""}`}
        >
          {progress !== null ? `Uploading… ${progress} %` : label}
        </label>
        <p className="text-[0.8125rem] text-t2">{hint}</p>
      </div>
      {progress !== null && (
        <div className="mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p role="status" aria-live="polite" className={`mt-2 text-[0.8125rem] ${message?.tone === "error" ? "text-mismatch" : "text-t2"}`}>
        {message?.text}
      </p>
    </div>
  );
}

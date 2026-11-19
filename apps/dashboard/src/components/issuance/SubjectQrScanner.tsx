import * as Dialog from "@radix-ui/react-dialog";
import { Camera, ImageUp, X } from "lucide-react";
import QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";

import { subjectDidFromQr } from "@/lib/claim-issuance";

type Props = {
  onDid: (did: string) => void;
};

export function SubjectQrScanner({ onDid }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning">("idle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const requestRef = useRef(0);

  function stopScanner() {
    requestRef.current += 1;
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setStatus("idle");
  }

  useEffect(
    () => () => {
      requestRef.current += 1;
      scannerRef.current?.destroy();
      scannerRef.current = null;
    },
    [],
  );

  function acceptQrValue(rawValue: string) {
    try {
      const did = subjectDidFromQr(rawValue);
      onDid(did);
      setError(null);
      stopScanner();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read a subject DID.");
    }
  }

  async function startCamera() {
    if (!videoRef.current || scannerRef.current) return;
    const request = ++requestRef.current;
    setStatus("starting");
    setError(null);
    const scanner = new QrScanner(videoRef.current, (result) => acceptQrValue(result.data), {
      preferredCamera: "environment",
      highlightScanRegion: true,
      highlightCodeOutline: true,
      returnDetailedScanResult: true,
      onDecodeError: () => undefined,
    });
    scannerRef.current = scanner;
    try {
      await scanner.start();
      if (requestRef.current !== request || scannerRef.current !== scanner) {
        scanner.destroy();
        return;
      }
      setStatus("scanning");
    } catch (cause) {
      if (requestRef.current !== request || scannerRef.current !== scanner) return;
      scanner.destroy();
      scannerRef.current = null;
      setStatus("idle");
      setError(
        cause instanceof Error
          ? `Camera unavailable: ${cause.message}`
          : "Camera access is unavailable.",
      );
    }
  }

  async function scanImage(file: File | undefined) {
    if (!file) return;
    stopScanner();
    const request = ++requestRef.current;
    setError(null);
    try {
      const result = await QrScanner.scanImage(file, {
        alsoTryWithoutScanRegion: true,
        returnDetailedScanResult: true,
      });
      if (requestRef.current !== request) return;
      acceptQrValue(result.data);
    } catch (cause) {
      if (requestRef.current !== request) return;
      setError(cause instanceof Error ? cause.message : "No QR code was found in that image.");
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) stopScanner();
    setError(null);
    setOpen(nextOpen);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button className="issuance-scan-trigger" type="button">
          <Camera size={16} aria-hidden="true" /> Scan QR
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="issuance-dialog-overlay" />
        <Dialog.Content className="issuance-dialog" aria-describedby="subject-qr-description">
          <div className="issuance-dialog__header">
            <div>
              <Dialog.Title>Scan subject identity</Dialog.Title>
              <Dialog.Description id="subject-qr-description">
                Read a QR code containing a did:ckb identity or Vellum profile link.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="issuance-icon-button"
                type="button"
                aria-label="Close QR scanner"
                title="Close"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className="issuance-scanner-viewport">
            <video ref={videoRef} muted playsInline aria-label="QR camera preview" />
            {status !== "scanning" && (
              <div className="issuance-scanner-viewport__idle">
                <Camera size={28} aria-hidden="true" />
                <span>{status === "starting" ? "Requesting camera access" : "Camera is off"}</span>
              </div>
            )}
          </div>

          {error && (
            <p className="issuance-dialog__error" role="alert">
              {error}
            </p>
          )}

          <div className="issuance-dialog__actions">
            <button
              className="v-button v-button--primary"
              type="button"
              disabled={status !== "idle"}
              onClick={() => void startCamera()}
            >
              <Camera size={15} aria-hidden="true" />
              {status === "starting" ? "Starting camera" : "Start camera"}
            </button>
            <button
              className="v-button v-button--secondary issuance-image-picker"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageUp size={15} aria-hidden="true" /> Read QR image
            </button>
            <input
              ref={fileInputRef}
              className="issuance-visually-hidden"
              type="file"
              accept="image/*"
              tabIndex={-1}
              onChange={(event) => {
                void scanImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

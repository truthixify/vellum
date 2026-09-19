import * as Dialog from "@radix-ui/react-dialog";
import { toPng } from "html-to-image";
import { Check, Copy, Download, Maximize2, Share2, X } from "lucide-react";
import QRCode from "react-qr-code";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AvailableReputation } from "@/lib/reputation";
import { buildReputationShareUrl, reputationCardFilename } from "@/lib/reputation-share";

const CATEGORY_LABELS: Record<AvailableReputation["categories"][number]["id"], string> = {
  technical: "Technical",
  contribution: "Contribution",
  community: "Community",
  tenure: "Tenure",
  recency: "Recency",
};

const SHARE_ANIMATION = {
  scoreDurationMs: 650,
  contentDelayMs: 110,
  categoryStepMs: 55,
} as const;

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function shortenDid(did: string): string {
  return `${did.slice(0, 20)}…${did.slice(-10)}`;
}

function useAnimatedScore(target: number, active: boolean): number {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    setValue(0);

    const update = (now: number) => {
      const progress = Math.min((now - startedAt) / SHARE_ANIMATION.scoreDurationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = window.requestAnimationFrame(update);
    };

    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [active, target]);

  return value;
}

function ReputationShareCard({
  result,
  shareUrl,
  animated,
  exportSize = false,
}: {
  result: AvailableReputation;
  shareUrl: string;
  animated: boolean;
  exportSize?: boolean;
}) {
  const score = useAnimatedScore(result.overall.score, animated);

  return (
    <div
      className={`reputation-share-card${exportSize ? " reputation-share-card--export" : ""}`}
      data-animated={animated ? "true" : "false"}
    >
      <div className="reputation-share-card__brand">
        <span className="reputation-share-card__mark">V</span>
        <strong>VELLUM</strong>
        <span>CKB TESTNET</span>
      </div>

      <div className="reputation-share-card__body">
        <div className="reputation-share-card__score">
          <span>Aggregate reputation</span>
          <div>
            <strong>{score}</strong>
            <small>/{result.overall.maximum}</small>
          </div>
          <div className="reputation-share-card__rail" aria-hidden="true">
            <span
              style={
                {
                  "--share-score": `${(result.overall.score / result.overall.maximum) * 100}%`,
                } as React.CSSProperties
              }
            />
          </div>
        </div>

        <div className="reputation-share-card__qr">
          <QRCode
            value={shareUrl}
            size={exportSize ? 168 : 124}
            bgColor="#f4f5ef"
            fgColor="#101814"
            level="M"
            aria-label="QR code for this public reputation page"
          />
          <span>Scan to inspect evidence</span>
        </div>
      </div>

      <div className="reputation-share-card__categories">
        {result.categories.map((category, index) => (
          <div
            key={category.id}
            style={
              {
                "--category-delay": `${SHARE_ANIMATION.contentDelayMs + index * SHARE_ANIMATION.categoryStepMs}ms`,
              } as React.CSSProperties
            }
          >
            <span>{CATEGORY_LABELS[category.id]}</span>
            <strong>
              {category.score}
              <small>/{category.maximum}</small>
            </strong>
          </div>
        ))}
      </div>

      <div className="reputation-share-card__footer">
        <div>
          <span>Subject</span>
          <strong>{shortenDid(result.subject)}</strong>
        </div>
        <div>
          <span>Policy</span>
          <strong>{result.policyVersion}</strong>
        </div>
        <div>
          <span>Evaluated</span>
          <strong>{formatDate(result.evaluatedAt)} UTC</strong>
        </div>
      </div>
    </div>
  );
}

export function ReputationShareDialog({ result }: { result: AvailableReputation }) {
  const [open, setOpen] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const shareUrl = useMemo(() => buildReputationShareUrl(result.subject), [result.subject]);

  async function renderCard(): Promise<string> {
    if (!exportRef.current) throw new Error("The share card is not ready.");
    await document.fonts.ready;
    return toPng(exportRef.current, {
      width: 1200,
      height: 630,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: "#f4f5ef",
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Link copied");
    } catch {
      setStatus("Copy failed. Select the link below.");
    }
  }

  async function downloadCard() {
    setWorking(true);
    setStatus("");
    try {
      const dataUrl = await renderCard();
      const anchor = document.createElement("a");
      anchor.download = reputationCardFilename(result.subject);
      anchor.href = dataUrl;
      anchor.click();
      setStatus("Card downloaded");
    } catch {
      setStatus("The card could not be downloaded.");
    } finally {
      setWorking(false);
    }
  }

  async function shareCard() {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    setWorking(true);
    setStatus("");
    try {
      const dataUrl = await renderCard();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], reputationCardFilename(result.subject), { type: "image/png" });
      const data: ShareData = {
        title: "Vellum reputation",
        text: `Vellum reputation score: ${result.overall.score}/${result.overall.maximum}`,
        url: shareUrl,
      };
      if (navigator.canShare?.({ files: [file] })) data.files = [file];
      await navigator.share(data);
      setStatus("Shared");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Sharing was not completed.");
    } finally {
      setWorking(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQrExpanded(false);
      setStatus("");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button type="button" className="v-button v-button--primary">
          <Share2 size={14} aria-hidden="true" /> Share score
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="reputation-share-overlay" />
        <Dialog.Content className="reputation-share-dialog">
          <div className="reputation-share-dialog__header">
            <div>
              <Dialog.Title>Share reputation</Dialog.Title>
              <Dialog.Description>
                A public snapshot linked to the live score and its evidence.
              </Dialog.Description>
            </div>
            <Dialog.Close className="reputation-share-dialog__close" aria-label="Close">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <button
            type="button"
            className={`reputation-share-preview${qrExpanded ? " reputation-share-preview--qr" : ""}`}
            onClick={() => setQrExpanded((value) => !value)}
            aria-label={qrExpanded ? "Show full score card" : "Enlarge QR code"}
          >
            {qrExpanded ? (
              <span className="reputation-share-expanded-qr">
                <QRCode value={shareUrl} size={236} bgColor="#f4f5ef" fgColor="#101814" level="M" />
                <span>
                  <Maximize2 size={14} aria-hidden="true" /> Tap to return to card
                </span>
              </span>
            ) : (
              <ReputationShareCard result={result} shareUrl={shareUrl} animated={open} />
            )}
          </button>

          <div className="reputation-share-dialog__url">
            <span>{shareUrl}</span>
          </div>

          <div className="reputation-share-dialog__actions">
            <button type="button" className="v-button v-button--secondary" onClick={copyLink}>
              {status === "Link copied" ? <Check size={14} /> : <Copy size={14} />} Copy link
            </button>
            <button
              type="button"
              className="v-button v-button--secondary"
              onClick={downloadCard}
              disabled={working}
            >
              <Download size={14} aria-hidden="true" /> Download
            </button>
            <button
              type="button"
              className="v-button v-button--primary"
              onClick={shareCard}
              disabled={working}
            >
              <Share2 size={14} aria-hidden="true" /> Share
            </button>
          </div>
          <div className="reputation-share-dialog__status" aria-live="polite">
            {working ? "Preparing card…" : status}
          </div>

          <div className="reputation-share-export" aria-hidden="true">
            <div ref={exportRef}>
              <ReputationShareCard
                result={result}
                shareUrl={shareUrl}
                animated={false}
                exportSize
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

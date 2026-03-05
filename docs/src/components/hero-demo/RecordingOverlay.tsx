import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { EASE_OUT, EASE_SMOOTH } from "./context";

export function RecordingOverlay({
  overlayRect,
  isSaving,
  showSaveButton,
  onSave,
}: {
  overlayRect: DOMRect;
  isSaving: boolean;
  showSaveButton: boolean;
  onSave: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        top: overlayRect.top,
        left: overlayRect.left,
        width: overlayRect.width,
      }}
    >
      {/* Floating video */}
      <motion.div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{ height: overlayRect.height, transformOrigin: "center bottom" }}
        initial={{ scale: 1, y: 0 }}
        animate={
          isSaving
            ? { scaleY: 0.05, scaleX: 0.2, y: overlayRect.height - 30, opacity: 0 }
            : { scale: 1.06, y: -20 }
        }
        transition={
          isSaving
            ? { duration: 0.5, ease: EASE_OUT, opacity: { delay: 0.2, duration: 0.3 } }
            : { duration: 1.2, ease: EASE_SMOOTH }
        }
      >
        <motion.div
          className="w-full h-full rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(255, 255, 255, 0.15)" }}
          initial={{ boxShadow: "0 0 0 rgba(255,255,255,0)" }}
          animate={{
            boxShadow: "0 0 40px rgba(255, 255, 255, 0.08), 0 0 80px rgba(255, 255, 255, 0.04)",
          }}
          transition={{ duration: 1.2, ease: EASE_SMOOTH }}
        >
          <video
            src="/card-recording.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Pause button */}
        <motion.div
          className="absolute inset-x-0 bottom-6 flex justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: isSaving ? 0 : 1, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE_SMOOTH }}
        >
          <div
            className="w-12 h-12 rounded-full bg-white flex items-center justify-center"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}
          >
            <svg role="none" width="18" height="18" viewBox="0 0 24 24" fill="black" stroke="none">
              <rect x="14" y="3" width="5" height="18" rx="1" />
              <rect x="5" y="3" width="5" height="18" rx="1" />
            </svg>
          </div>
        </motion.div>
      </motion.div>

      {/* Save button */}
      <AnimatePresence>
        {showSaveButton && (
          <motion.div
            className="pointer-events-auto absolute left-1/2"
            style={{ top: overlayRect.height - 14 }}
            initial={{ opacity: 0, y: 10, scale: 0.8, x: "-50%" }}
            animate={{ opacity: isSaving ? 0 : 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.4, ease: EASE_SMOOTH }}
          >
            <motion.button
              data-save-btn
              className="relative overflow-hidden flex items-center justify-center rounded-full"
              style={{
                width: 48,
                height: 48,
                background:
                  "linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.08))",
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
              whileTap={{ scale: 0.93 }}
              onClick={onSave}
            >
              <svg
                role="none"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 15V3" />
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10 5 5 5-5" />
              </svg>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

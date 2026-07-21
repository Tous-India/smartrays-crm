import { useEffect, useRef, useState } from "react";

/**
 * Wraps `navigator.mediaDevices.getUserMedia` + a `<canvas>` snapshot —
 * chosen over a camera library (e.g. `react-webcam`) since front/back
 * camera switching or any UI beyond "preview, then capture on a button
 * press" was never asked for here, and the native API is genuinely simple
 * enough not to need one (see frontend/README.md for the full reasoning).
 *
 * The `<video>` element itself is owned by the caller (`CameraCapture.jsx`)
 * — this hook only manages the stream and exposes `videoRef` to attach to
 * it, so the video's `autoPlay`/`muted`/`playsInline` attributes (needed for
 * the stream to actually render without extra `.play()` plumbing, which
 * jsdom doesn't implement anyway) stay ordinary JSX, not hook logic.
 */
export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [error, setError] = useState(null);

  async function startCamera() {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsCameraReady(true);
    } catch {
      setError("Camera access was denied or is unavailable — allow camera access to check in/out.");
      setIsCameraReady(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCameraReady(false);
  }

  /**
   * Snapshots the current video frame onto an off-screen canvas and encodes
   * it as a JPEG data URI — exactly the "base64 data URI (JSON body)"
   * transport `attendance.validation.js` already accepts, so no `FormData`
   * plumbing is needed on the API call.
   */
  function capturePhoto() {
    if (!videoRef.current) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 320;
    canvas.height = videoRef.current.videoHeight || 240;

    const context = canvas.getContext("2d");
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const dataUri = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedPhoto(dataUri);

    return dataUri;
  }

  function retake() {
    setCapturedPhoto(null);
  }

  useEffect(() => stopCamera, []);

  return { videoRef, isCameraReady, capturedPhoto, error, startCamera, stopCamera, capturePhoto, retake };
}

export default useCamera;

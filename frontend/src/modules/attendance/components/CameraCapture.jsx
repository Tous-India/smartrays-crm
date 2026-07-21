import { useEffect } from "react";
import { Alert, Button, Space } from "antd";
import { CameraOutlined, RedoOutlined } from "@ant-design/icons";
import useCamera from "../hooks/useCamera";

/**
 * Live camera preview + an explicit "Capture Photo" button — the snapshot
 * only happens on a deliberate click, never automatically, per this task's
 * own requirement. Starts the camera stream as soon as it mounts (it's only
 * ever rendered once the user has already chosen to check in/out) and stops
 * it on unmount so the browser's camera-in-use indicator doesn't linger.
 */
function CameraCapture({ onPhotoChange }) {
  const { videoRef, isCameraReady, capturedPhoto, error, startCamera, stopCamera, capturePhoto, retake } =
    useCamera();

  useEffect(() => {
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onPhotoChange(capturedPhoto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedPhoto]);

  function handleCapture() {
    capturePhoto();
  }

  if (error) {
    return <Alert type="error" showIcon message="Camera unavailable" description={error} />;
  }

  return (
    <div>
      {capturedPhoto ? (
        <Space direction="vertical">
          {/* eslint-disable-next-line jsx-a11y/alt-text -- a captured selfie has no meaningful alt text */}
          <img src={capturedPhoto} alt="Captured check-in/out photo" className="w-full max-w-xs rounded" />
          <Button icon={<RedoOutlined />} onClick={retake}>
            Retake Photo
          </Button>
        </Space>
      ) : (
        <Space direction="vertical">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a live camera preview has no captions to provide */}
          <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-xs rounded bg-black" />
          <Button
            type="primary"
            icon={<CameraOutlined />}
            disabled={!isCameraReady}
            onClick={handleCapture}
          >
            Capture Photo
          </Button>
        </Space>
      )}
    </div>
  );
}

export default CameraCapture;

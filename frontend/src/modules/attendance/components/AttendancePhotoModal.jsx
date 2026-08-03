import { Modal, Row, Col, Image, Empty, Tag, Typography, Space } from "antd";
import { EnvironmentOutlined } from "@ant-design/icons";
import ConnectivityGapBar from "./ConnectivityGapBar";
import GeofenceViolationBar from "./GeofenceViolationBar";
import { ATTENDANCE_STATUS_COLORS, ATTENDANCE_STATUS_LABELS } from "../constants/attendance.constants";

const { Text } = Typography;

function CoordsDisplay({ coords }) {
  if (!coords || coords.lat == null || coords.lng == null) {
    return (
      <Text type="secondary" className="text-xs">
        No coordinates captured
      </Text>
    );
  }

  return (
    <Text type="secondary" className="text-xs">
      Lat {coords.lat.toFixed(5)}, Lng {coords.lng.toFixed(5)}
    </Text>
  );
}

/**
 * `showPhoto`/`showLocation` (§7.4c) gate the photo image and coords line
 * independently — `time` is never gated, it's not the sensitive part. When
 * `showPhoto` is false, the photo area is omitted entirely rather than
 * showing a "No photo" placeholder — that placeholder means something
 * different (a manually-created record genuinely has none) than "you don't
 * have permission to see this," and conflating the two would make a
 * permission boundary look like a data problem.
 */
function PhotoSlot({ title, photoUrl, time, coords, showPhoto, showLocation }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{title}</div>
      {showPhoto &&
        (photoUrl ? (
          <Image src={photoUrl} alt={`${title} photo`} width="100%" style={{ maxHeight: 220, objectFit: "cover" }} />
        ) : (
          <div className="flex h-[140px] items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50">
            <Empty description="No photo" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ))}
      <div className="mt-1 text-xs text-gray-500">{time ? new Date(time).toLocaleString() : "Not recorded"}</div>
      {showLocation && <CoordsDisplay coords={coords} />}
    </div>
  );
}

/**
 * Photos already existed on every Attendance record
 * (`checkIn.photoUrl`/`checkOut.photoUrl`, uploaded to Cloudinary at
 * check-in/out) but had no UI surfacing them anywhere before this — clicking
 * a day's record in `AttendanceTimeline` opens this same modal. Gracefully
 * handles a missing photo (`PhotoSlot`'s own empty state) — the normal case
 * for a manually-created record (§7.4's admin-correction addition), which
 * has no photo/coords at all by design.
 *
 * Read-only detail view — the admin-correction Edit action that used to live
 * in this modal's footer was removed (Attendance is UI-read-only for every
 * role now; see `backend/README.md`'s note on the dormant `PATCH
 * /attendance/:id` endpoint). Viewing photos/location here is unaffected.
 *
 * `showPhotos`/`showLocation` (§7.4c) — independent gates matching the
 * backend's own `attendance.view_photos`/`view_location` permissions
 * (Team view) or the hard "never your own" rule (Personal view, always
 * both `false` regardless of the viewer's permissions — see
 * `PersonalAttendanceView.jsx`). The backend already strips the underlying
 * `photoUrl`/`coords` data the viewer isn't allowed to see, so these props
 * only control whether the SECTION itself renders — without them, a
 * manager lacking the grant would see a "No photo"/"No coordinates"
 * placeholder that looks like a data problem rather than a permission
 * boundary they simply don't have.
 */
function AttendancePhotoModal({ open, record, onCancel, showPhotos, showLocation }) {
  if (!record) {
    return null;
  }

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      title={`Attendance — ${new Date(record.date).toLocaleDateString()}`}
    >
      <Space direction="vertical" size="middle" className="w-full">
        <Space wrap>
          <Tag color={ATTENDANCE_STATUS_COLORS[record.status]}>{ATTENDANCE_STATUS_LABELS[record.status]}</Tag>
          {record.isManuallyAdjusted && (
            <Tag color="gold">Manually adjusted by admin — not a verified self-check-in</Tag>
          )}
        </Space>

        <Row gutter={16}>
          <Col span={12}>
            <PhotoSlot
              title="Check-In"
              photoUrl={record.checkIn?.photoUrl}
              time={record.checkIn?.time}
              coords={record.checkIn?.coords}
              showPhoto={showPhotos}
              showLocation={showLocation}
            />
          </Col>
          <Col span={12}>
            <PhotoSlot
              title="Check-Out"
              photoUrl={record.checkOut?.photoUrl}
              time={record.checkOut?.time}
              coords={record.checkOut?.coords}
              showPhoto={showPhotos}
              showLocation={showLocation}
            />
          </Col>
        </Row>

        <div>
          <div className="mb-1 text-sm font-medium">Connectivity Gaps</div>
          <ConnectivityGapBar record={record} />
        </div>

        {showLocation && (
          <div>
            <div className="mb-1 text-sm font-medium">
              <EnvironmentOutlined className="mr-1" />
              Location
            </div>
            <GeofenceViolationBar record={record} />
          </div>
        )}
      </Space>
    </Modal>
  );
}

export default AttendancePhotoModal;

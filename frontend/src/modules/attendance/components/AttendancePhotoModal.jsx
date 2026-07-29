import { Modal, Row, Col, Image, Empty, Tag, Typography, Button, Space } from "antd";
import { EditOutlined, EnvironmentOutlined } from "@ant-design/icons";
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

function PhotoSlot({ title, photoUrl, time, coords }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{title}</div>
      {photoUrl ? (
        <Image src={photoUrl} alt={`${title} photo`} width="100%" style={{ maxHeight: 220, objectFit: "cover" }} />
      ) : (
        <div className="flex h-[140px] items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50">
          <Empty description="No photo" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )}
      <div className="mt-1 text-xs text-gray-500">{time ? new Date(time).toLocaleString() : "Not recorded"}</div>
      <CoordsDisplay coords={coords} />
    </div>
  );
}

/**
 * Photos already existed on every Attendance record
 * (`checkIn.photoUrl`/`checkOut.photoUrl`, uploaded to Cloudinary at
 * check-in/out) but had no UI surfacing them anywhere before this — clicking
 * a day's record in either `AttendanceTimeline` (list view) or
 * `AttendanceCalendar` (grid view) opens this same modal. Gracefully
 * handles a missing photo (`PhotoSlot`'s own empty state) — the normal case
 * for a manually-created record (§7.4's admin-correction addition), which
 * has no photo/coords at all by design.
 *
 * `onEdit` is only passed by the parent when the current user is an admin
 * (the same role gate the backend's `PATCH /attendance/:id` enforces) — the
 * Edit button here is the "from either the list or calendar view" entry
 * point the admin-correction UI needs, reached via the day's own detail
 * view rather than a separate action per row.
 */
function AttendancePhotoModal({ open, record, onCancel, onEdit }) {
  if (!record) {
    return null;
  }

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={
        onEdit ? (
          <Button icon={<EditOutlined />} onClick={onEdit}>
            Edit Record
          </Button>
        ) : null
      }
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
            />
          </Col>
          <Col span={12}>
            <PhotoSlot
              title="Check-Out"
              photoUrl={record.checkOut?.photoUrl}
              time={record.checkOut?.time}
              coords={record.checkOut?.coords}
            />
          </Col>
        </Row>

        <div>
          <div className="mb-1 text-sm font-medium">Connectivity Gaps</div>
          <ConnectivityGapBar record={record} />
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">
            <EnvironmentOutlined className="mr-1" />
            Location
          </div>
          <GeofenceViolationBar record={record} />
        </div>
      </Space>
    </Modal>
  );
}

export default AttendancePhotoModal;

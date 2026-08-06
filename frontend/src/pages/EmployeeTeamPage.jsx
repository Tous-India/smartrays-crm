import { useEffect, useState } from "react";
import { Card, List, Tag, Empty, Spin, Alert, Avatar, Typography } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { getMyTeam } from "../modules/team/api/teamApi";

const { Text } = Typography;

/**
 * `/team` for employees (§7.39, 2026-08-05) — who leads their team, and who
 * else is on it.
 *
 * Deliberately shows NO attendance or leave status of teammates: this answers
 * "who do I work with", not "who is in today". The latter is a manager-level
 * question and would leak colleagues' whereabouts to their peers.
 *
 * Contact details appear only when that team has opted in. The backend omits
 * those fields from the payload entirely when it hasn't, so this component
 * renders whatever it is given rather than deciding what to conceal — there
 * is no client-side check here to bypass.
 *
 * Reads `GET /teams/mine` rather than `GET /teams`: the latter needs a
 * `teams.*` grant that an employee doesn't have.
 */
function EmployeeTeamPage() {
  const [team, setTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getMyTeam()
      .then((response) => {
        if (!cancelled) setTeam(response.data.data);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spin />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message="Could not load your team" description="Please try again." />;
  }

  if (!team) {
    return <Empty description="You're not assigned to a team yet" />;
  }

  const people = [
    ...(team.head ? [{ ...team.head, isHead: true }] : []),
    ...team.members.filter((member) => String(member._id) !== String(team.head?._id)),
  ];

  return (
    <Card title={team.name} className="app-elevated-card">
      <List
        dataSource={people}
        locale={{ emptyText: "No teammates yet" }}
        renderItem={(person) => (
          <List.Item data-testid={`teammate-${person._id}`}>
            <List.Item.Meta
              avatar={<Avatar src={person.photo || undefined} icon={<UserOutlined />} />}
              title={
                <span>
                  {person.name} {person.isHead && <Tag color="blue">Team head</Tag>}
                </span>
              }
              description={
                (person.email || person.phone) && (
                  <Text type="secondary" className="text-xs" data-testid={`contact-${person._id}`}>
                    {[person.email, person.phone].filter(Boolean).join(" · ")}
                  </Text>
                )
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
}

export default EmployeeTeamPage;

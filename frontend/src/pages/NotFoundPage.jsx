import { Result } from "antd";
import { Link } from "react-router-dom";
import { ROUTE_PATHS } from "../constants/routePaths.constants";

function NotFoundPage() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="Sorry, this page doesn't exist."
      extra={<Link to={ROUTE_PATHS.ROOT}>Back home</Link>}
    />
  );
}

export default NotFoundPage;

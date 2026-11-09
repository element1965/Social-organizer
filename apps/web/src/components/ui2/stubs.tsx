import { Navigate, useParams } from 'react-router-dom';

/** Old profile URLs now open the person screen. */
export function ProfileRedirect() {
  const { userId } = useParams();
  return <Navigate to={userId ? `/person/${userId}` : '/'} replace />;
}

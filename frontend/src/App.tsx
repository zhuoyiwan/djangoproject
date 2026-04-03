import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./app/auth";
import { AppLayout } from "./app/AppLayout";
import { RequireAuth } from "./app/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { AutomationPage } from "./pages/AutomationPage";
import { AuditPage } from "./pages/AuditPage";
import { AutomationDetailPage } from "./pages/AutomationDetailPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ServersPage } from "./pages/ServersPage";

function HomeRedirect() {
  const { accessToken } = useAuth();
  return <Navigate to={accessToken ? "/overview" : "/login"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/servers" element={<ServersPage />} />
            <Route path="/automation" element={<AutomationPage />} />
            <Route path="/automation/:jobId" element={<AutomationDetailPage />} />
            <Route path="/audit" element={<AuditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

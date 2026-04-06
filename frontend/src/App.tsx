import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./app/auth";
import { AppLayout } from "./app/AppLayout";
import { RequireAuth } from "./app/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { AutomationPage } from "./pages/AutomationPage";
import { AuditPage } from "./pages/AuditPage";
import { AutomationDetailPage } from "./pages/AutomationDetailPage";
import { OverviewPage } from "./pages/OverviewPage";
import { IDCsPage } from "./pages/IDCsPage";
import { ServersPage } from "./pages/ServersPage";
import { UsersPage } from "./pages/UsersPage";
import { ContractPage } from "./pages/ContractPage";

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
            <Route path="/users" element={<UsersPage />} />
            <Route path="/contract" element={<ContractPage />} />
            <Route path="/idcs" element={<IDCsPage />} />
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

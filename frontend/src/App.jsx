import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import PersonasPage from "./pages/PersonasPage";
import PersonaDetailPage from "./pages/PersonaDetailPage";
import ChatPage from "./pages/ChatPage";
import GroupChatPage from "./pages/GroupChatPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/personas" element={<PersonasPage />} />
            <Route path="/personas/:personaId" element={<PersonaDetailPage />} />
            <Route path="/personas/:personaId/chat" element={<ChatPage />} />
            <Route path="/groups/:groupId/chat" element={<GroupChatPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/personas" replace />} />
          <Route path="*" element={<Navigate to="/personas" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

// src/components/ProtectedRoute.jsx

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({

  children,
  allowedRoles = []

}) {

  const {

    currentUser,
    role,
    authLoading

  } = useAuth()

  // Firebase still restoring session
  if (authLoading) {

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d0d0d',
        color: '#fff',
        fontSize: 18
      }}>
        Loading...
      </div>
    )
  }

  // Not logged in
  if (!currentUser) {

    return <Navigate to="/" replace />
  }

  // Role blocked
  if (
    allowedRoles.length > 0 &&
    !allowedRoles.includes(role)
  ) {

    return <Navigate to="/dashboard" replace />
  }

  return children
}
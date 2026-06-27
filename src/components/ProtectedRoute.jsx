// src/components/ProtectedRoute.jsx

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingVideo from './LoadingVideo'

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

    return <LoadingVideo />
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
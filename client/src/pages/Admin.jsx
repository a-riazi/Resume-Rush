import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../styles/Admin.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : 'https://api.resumerush.io')

export default function Admin({ darkMode }) {
  const { user, loading: authLoading, token } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTier, setFilterTier] = useState('all')

  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!user) {
      navigate('/')
      return
    }

    const fetchUsers = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await axios.get(`${API_BASE_URL}/api/admin/users`, {
          headers: {
            Authorization: `Bearer ${token || localStorage.getItem('auth_token')}`,
          },
        })
        setUsers(response.data.users || [])
      } catch (err) {
        console.error('Error fetching users:', err)
        if (err.response?.status === 403) {
          setError('You do not have admin access')
          setTimeout(() => navigate('/'), 2000)
        } else {
          setError(err.response?.data?.error || 'Failed to fetch users')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [authLoading, user, token, navigate])

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesTier =
      filterTier === 'all' ||
      (filterTier === 'monthly' && u.monthlySubscription) ||
      (filterTier === 'one-time' && u.oneTimeSubscription) ||
      (filterTier === 'free' && !u.monthlySubscription && !u.oneTimeSubscription) ||
      (filterTier === 'auth-free' && u.userTier === 'auth-free')

    return matchesSearch && matchesTier
  })

  const formatPlanDate = (subscription) => {
    if (!subscription?.currentPeriodEnd) {
      return '—'
    }

    const isExpiredLike = subscription.tier === 'one-time'
      ? true
      : subscription.status === 'canceled' || subscription.status === 'expired'

    const label = isExpiredLike ? 'Expires' : 'Renews'
    return `${label}: ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
  }

  const getPlanBadgeText = (subscription) => {
    if (!subscription) {
      return 'None'
    }

    if (subscription.tier === 'monthly') {
      return `Monthly (${subscription.status})`
    }

    if (subscription.tier === 'one-time') {
      return `One-Time (${subscription.status})`
    }

    return `${subscription.tier} (${subscription.status})`
  }

  const stats = {
    total: users.length,
    free: users.filter((u) => !u.monthlySubscription && !u.oneTimeSubscription).length,
    monthly: users.filter((u) => u.monthlySubscription).length,
    oneTime: users.filter((u) => u.oneTimeSubscription).length,
    both: users.filter((u) => u.monthlySubscription && u.oneTimeSubscription).length,
  }

  return (
    <div className={`admin-container ${darkMode ? 'dark' : ''}`}>
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p className="admin-subtitle">Manage users and subscriptions</p>
      </div>

      {error && (
        <div className="admin-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">
          <div className="spinner"></div>
          <p>Loading users...</p>
        </div>
      ) : (
        <>
          <div className="admin-stats">
            <div className="stat-card">
              <div className="stat-label">Total Users</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Free</div>
              <div className="stat-value">{stats.free}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Monthly</div>
              <div className="stat-value">{stats.monthly}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">One-Time</div>
              <div className="stat-value">{stats.oneTime}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Both Plans</div>
              <div className="stat-value">{stats.both}</div>
            </div>
          </div>

          <div className="admin-filters">
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="tier-filter"
            >
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="auth-free">Auth-Free</option>
              <option value="monthly">Monthly</option>
              <option value="one-time">One-Time</option>
            </select>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Monthly Plan</th>
                  <th>Monthly Date</th>
                  <th>One-Time Plan</th>
                  <th>One-Time Date</th>
                  <th>Generations Used</th>
                  <th>Signup Date</th>
                  <th>Stripe IDs</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="email-cell">
                        <a href={`mailto:${u.email}`}>{u.email}</a>
                      </td>
                      <td>{u.name || '—'}</td>
                      <td>
                        <span className={`badge badge-${u.monthlySubscription?.tier || 'free'}`}>
                          {getPlanBadgeText(u.monthlySubscription)}
                        </span>
                      </td>
                      <td>{formatPlanDate(u.monthlySubscription)}</td>
                      <td>
                        <span className={`badge badge-${u.oneTimeSubscription?.tier || 'free'}`}>
                          {getPlanBadgeText(u.oneTimeSubscription)}
                        </span>
                      </td>
                      <td>{formatPlanDate(u.oneTimeSubscription)}</td>
                      <td className="usage-cell">{u.generationsUsed}</td>
                      <td>{u.signupDate}</td>
                      <td className="stripe-id">
                        <div className="stripe-id-list">
                          <div>
                            Monthly: {u.monthlySubscription?.stripeSubscriptionId ? (
                              <code>{u.monthlySubscription.stripeSubscriptionId.substring(0, 20)}...</code>
                            ) : '—'}
                          </div>
                          <div>
                            One-Time: {u.oneTimeSubscription?.stripeSubscriptionId ? (
                              <code>{u.oneTimeSubscription.stripeSubscriptionId.substring(0, 20)}...</code>
                            ) : '—'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" className="no-results">
                      No users found matching your search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-footer">
            <p>Showing {filteredUsers.length} of {users.length} users</p>
          </div>
        </>
      )}
    </div>
  )
}

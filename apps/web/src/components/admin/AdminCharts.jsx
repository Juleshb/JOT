import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { adminCardClass } from '../../lib/adminTheme'

const BRAND = '#9d3733'
const BRAND_LIGHT = '#c45a55'
const CREAM = '#f2e3bb'

const ROLE_COLORS = {
  RIDER: '#0ea5e9',
  DRIVER: '#d97706',
  ADMIN: BRAND,
}

const STATUS_COLORS = {
  REQUESTED: '#d97706',
  ACCEPTED: '#2563eb',
  STARTED: '#059669',
  COMPLETED: '#6b7280',
  CANCELLED: '#dc2626',
}

const VERIFICATION_COLORS = {
  PENDING: '#d97706',
  APPROVED: '#059669',
  REJECTED: '#dc2626',
}

function ChartCard({ title, subtitle, darkMode, children }) {
  return (
    <div className={adminCardClass(darkMode)}>
      <h3 className="font-accent text-lg font-bold">{title}</h3>
      {subtitle && <p className="mt-1 text-sm opacity-80">{subtitle}</p>}
      <div className="mt-4 h-52 w-full sm:h-64">{children}</div>
    </div>
  )
}

function ChartTooltip({ active, payload, label, darkMode }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs shadow-lg ${
        darkMode
          ? 'border-[#9d3733]/50 bg-[#1a1a1a] text-[#f2e3bb]'
          : 'border-[#9d3733]/30 bg-white text-[#2d100f]'
      }`}
    >
      {label && <p className="mb-1 font-semibold">{label}</p>}
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color ?? entry.fill }}>
          {entry.name}: <span className="font-bold">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

function formatDayLabel(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function UsersByRoleChart({ byRole, darkMode }) {
  const data = [
    { name: 'Riders', key: 'RIDER', value: byRole.RIDER ?? 0 },
    { name: 'Drivers', key: 'DRIVER', value: byRole.DRIVER ?? 0 },
    { name: 'Admins', key: 'ADMIN', value: byRole.ADMIN ?? 0 },
  ].filter((d) => d.value > 0)

  if (data.length === 0) {
    return (
      <ChartCard title="Users by role" subtitle="Distribution of accounts" darkMode={darkMode}>
        <p className="flex h-full items-center justify-center text-sm opacity-60">No user data yet.</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Users by role" subtitle="Distribution of accounts" darkMode={darkMode}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={ROLE_COLORS[entry.key]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip darkMode={darkMode} />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function RidesByStatusChart({ byStatus, darkMode }) {
  const order = ['REQUESTED', 'ACCEPTED', 'STARTED', 'COMPLETED', 'CANCELLED']
  const data = order.map((status) => ({
    status,
    count: byStatus[status] ?? 0,
  }))

  return (
    <ChartCard title="Rides by status" subtitle="All-time trip breakdown" darkMode={darkMode}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#333' : '#e8d5c4'} />
          <XAxis
            dataKey="status"
            tick={{ fontSize: 10, fill: darkMode ? CREAM : '#2d100f' }}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={56}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: darkMode ? CREAM : '#2d100f' }} />
          <Tooltip content={<ChartTooltip darkMode={darkMode} />} />
          <Bar dataKey="count" name="Rides" radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function RidesPerDayChart({ ridesPerDay, darkMode }) {
  const data = (ridesPerDay ?? []).map((row) => ({
    ...row,
    label: formatDayLabel(row.date),
  }))

  return (
    <ChartCard title="Rides per day" subtitle="Last 7 days" darkMode={darkMode}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="ridesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.45} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#333' : '#e8d5c4'} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: darkMode ? CREAM : '#2d100f' }}
            interval={0}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: darkMode ? CREAM : '#2d100f' }} />
          <Tooltip
            content={({ active, payload }) => (
              <ChartTooltip
                active={active}
                payload={payload?.map((p) => ({ ...p, name: 'Rides' }))}
                label={payload?.[0]?.payload?.label}
                darkMode={darkMode}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="count"
            name="Rides"
            stroke={BRAND}
            strokeWidth={2}
            fill="url(#ridesGradient)"
            dot={{ fill: BRAND_LIGHT, r: 4 }}
            activeDot={{ r: 6, fill: BRAND }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function DriversVerificationChart({ byVerification, darkMode }) {
  const data = [
    { name: 'Pending', key: 'PENDING', value: byVerification.PENDING ?? 0 },
    { name: 'Approved', key: 'APPROVED', value: byVerification.APPROVED ?? 0 },
    { name: 'Rejected', key: 'REJECTED', value: byVerification.REJECTED ?? 0 },
  ]

  return (
    <ChartCard title="Driver verification" subtitle="Fleet approval status" darkMode={darkMode}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#333' : '#e8d5c4'} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: darkMode ? CREAM : '#2d100f' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={72}
            tick={{ fontSize: 12, fill: darkMode ? CREAM : '#2d100f' }}
          />
          <Tooltip content={<ChartTooltip darkMode={darkMode} />} />
          <Bar dataKey="value" name="Drivers" radius={[0, 6, 6, 0]}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={VERIFICATION_COLORS[entry.key]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

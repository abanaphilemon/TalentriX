import { useAuth } from '../context/AuthContext.jsx';

export default function HubDashboard() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-secondary/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="font-display text-xl font-bold text-secondary">
            Talent Hub Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-secondary/60">
              {user?.name || user?.email}
            </span>
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm font-semibold text-secondary bg-secondary/5 hover:bg-secondary/10 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-12">
        <p className="text-secondary/60">Welcome to your Talent Hub dashboard. Content coming soon.</p>
      </main>
    </div>
  );
}

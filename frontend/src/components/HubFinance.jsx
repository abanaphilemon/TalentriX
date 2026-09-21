import { useCallback, useEffect, useState } from 'react';
import {
  Wallet,
  Coins,
  Star,
  Loader2,
  Landmark,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  RefreshCw,
  Banknote,
  Building2,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-secondary/10 focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all text-sm';

const BANKS = [
  ['044', 'Access Bank'],
  ['058', 'Guaranty Trust Bank'],
  ['011', 'First Bank of Nigeria'],
  ['033', 'United Bank for Africa'],
  ['030', 'Zenith Bank'],
  ['032', 'Union Bank of Nigeria'],
  ['232', 'Sterling Bank'],
  ['070', 'Fidelity Bank'],
  ['050', 'Ecobank Nigeria'],
  ['214', 'First City Monument Bank'],
  ['221', 'Stanbic IBTC Bank'],
  ['082', 'Keystone Bank'],
  ['076', 'Polaris Bank'],
  ['215', 'Unity Bank'],
  ['090', 'Wema Bank'],
  ['101', 'Providus Bank'],
  ['105', 'Moniepoint MFB'],
  ['501', 'Paystack-Titan'],
  ['305', 'OPay Digital Services'],
];

const naira = (n) =>
  '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Card({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-secondary/10 p-5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-secondary/50 text-xs font-semibold uppercase tracking-wide">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="font-display text-2xl font-bold text-secondary">{value}</div>
      {sub && <div className="text-xs text-secondary/50">{sub}</div>}
    </div>
  );
}

function Status({ msg }) {
  if (!msg) return null;
  return (
    <p
      className={`inline-flex items-center gap-1.5 text-sm mt-3 ${
        msg.ok ? 'text-green-700' : 'text-red-600'
      }`}
    >
      {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {msg.text}
    </p>
  );
}

// Hub earnings & payouts. Shows the hub's 25% commission on paid chat unlocks,
// its reputation points from employer-confirmed hires, the payout account, and
// lets the hub withdraw its balance.
export default function HubFinance({ token }) {
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Payout account form + OTP confirm
  const [editing, setEditing] = useState(false);
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accName, setAccName] = useState('');
  const [savingAcc, setSavingAcc] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [accMsg, setAccMsg] = useState(null);
  const [accShowOtp, setAccShowOtp] = useState(false);

  // Withdrawal
  const [withdrawing, setWithdrawing] = useState(false);
  const [wMsg, setWMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/hub/finance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setFinance(d);
        if (d.account) {
          setBankCode(d.account.bankCode || '');
          setBankName(d.account.bankName || '');
          setAccNumber(d.account.accountNumber || '');
          setAccName(d.account.accountName || '');
          if (d.account.status === 'pending') setAccShowOtp(true);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const fillBank = (code) => {
    setBankCode(code);
    setBankName(BANKS.find((b) => b[0] === code)?.[1] || '');
  };

  const saveAccount = async () => {
    if (!bankCode || !accNumber.trim()) {
      setAccMsg({ ok: false, text: 'Select a bank and enter the account number.' });
      return;
    }
    setSavingAcc(true);
    setAccMsg(null);
    try {
      const res = await fetch(`${API_URL}/hub/payout-account`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bankName,
          bankCode,
          accountNumber: accNumber.replace(/\D/g, ''),
          accountName: accName.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not save the payout account.');
      setAccShowOtp(true);
      setBankCode(d.account.bankCode || bankCode);
      setAccName(d.account.accountName || accName);
      setAccMsg({ ok: true, text: d.message });
    } catch (e) {
      setAccMsg({ ok: false, text: e.message });
    } finally {
      setSavingAcc(false);
    }
  };

  const confirmAccount = async () => {
    if (!otpCode.trim()) {
      setAccMsg({ ok: false, text: 'Enter the code you received by email.' });
      return;
    }
    setConfirming(true);
    setAccMsg(null);
    try {
      const res = await fetch(`${API_URL}/hub/payout-account/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: otpCode.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not confirm the account.');
      setAccShowOtp(false);
      setOtpCode('');
      setEditing(false);
      setAccMsg({ ok: true, text: d.message });
      load();
    } catch (e) {
      setAccMsg({ ok: false, text: e.message });
    } finally {
      setConfirming(false);
    }
  };

  const requestWithdraw = async () => {
    if (!window.confirm('Withdraw all available commission to your payout account?')) return;
    setWithdrawing(true);
    setWMsg(null);
    try {
      const res = await fetch(`${API_URL}/hub/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || 'Could not process the withdrawal.');
      setWMsg({ ok: true, text: d.message });
      load();
    } catch (e) {
      setWMsg({ ok: false, text: e.message });
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading && !finance) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const commission = finance?.commission || { total: 0, pending: 0, withdrawn: 0, rate: 0.25 };
  const reputation = finance?.reputation || { points: 0 };
  const account = finance?.account || null;
  const available = commission.pending || 0;
  const accountActive = account?.status === 'active';

  return (
    <div className="space-y-6">
      {/* ── Summary cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          icon={Coins}
          label="Commission earned"
          value={naira(commission.total)}
          sub={`${Math.round((commission.rate || 0.25) * 100)}% of the base unlock fee`}
        />
        <Card icon={Wallet} label="Available" value={naira(available)} sub="Ready to withdraw" />
        <Card icon={Banknote} label="Withdrawn" value={naira(commission.withdrawn)} sub="Sent to your bank" />
        <Card
          icon={Star}
          label="Reputation points"
          value={reputation.points}
          sub="1 point per confirmed hire post"
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* ── Payout account + OTP ───────────────────────────────────── */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-secondary/10 p-8">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-primary" />
              <h3 className="font-display text-lg font-bold text-secondary">Payout account</h3>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="p-2 rounded-lg text-secondary/50 hover:text-secondary hover:bg-secondary/5 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-sm text-secondary/60 mb-5">
            Your commission is sent here via Monnify. Adding or changing the account
            requires the code emailed to your account address.
          </p>

          {!editing && account && accountActive && (
            <div className="flex flex-wrap items-center gap-4 p-5 rounded-xl bg-secondary/[0.03] border border-secondary/10">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <div className="font-semibold text-secondary flex items-center gap-2">
                  {account.bankName}{' '}
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> Confirmed
                  </span>
                </div>
                <div className="text-sm text-secondary/60">
                  •••• {String(account.accountNumber).slice(-4)} — {account.accountName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-primary inline-flex items-center gap-2"
              >
                Change
              </button>
            </div>
          )}

          {(!account || editing) && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">Bank</label>
                  <select className={inputCls} value={bankCode} onChange={(e) => fillBank(e.target.value)}>
                    <option value="">Select bank…</option>
                    {BANKS.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-secondary mb-1.5">Account number</label>
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10 digits"
                    value={accNumber}
                    onChange={(e) => setAccNumber(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-secondary mb-1.5">
                  Account name on the bank account
                </label>
                <input
                  className={inputCls}
                  placeholder="e.g. Jane Doe Enterprises"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                />
                <p className="text-[11px] text-secondary/40 mt-1.5">
                  We verify the name with the bank automatically when possible.
                </p>
              </div>

              {!account && (
                <button
                  type="button"
                  onClick={saveAccount}
                  disabled={savingAcc}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingAcc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
                  Save payout account
                </button>
              )}

              {account?.status === 'pending' && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-sm">
                  <ShieldCheck className="w-4 h-4" /> Pending — confirm this account below to activate it.
                </div>
              )}
              {editing && accountActive && (
                <button
                  type="button"
                  onClick={saveAccount}
                  disabled={savingAcc}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingAcc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
                  Save new account
                </button>
              )}
            </div>
          )}

          {accShowOtp && (
            <div className="mt-4 p-5 rounded-xl bg-secondary/[0.03] border border-secondary/10">
              <label className="block text-sm font-semibold text-secondary mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-primary" /> Mailbox code
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  className={`${inputCls} tracking-[0.3em] sm:max-w-[10rem]`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                />
                <button
                  type="button"
                  onClick={confirmAccount}
                  disabled={confirming}
                  className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Confirm account
                </button>
              </div>
            </div>
          )}

          <Status msg={accMsg} />
        </div>

        {/* ── Withdraw ────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-secondary/10 p-8 flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-5 h-5 text-primary" />
            <h3 className="font-display text-lg font-bold text-secondary">Withdraw</h3>
          </div>
          <p className="text-sm text-secondary/60 mb-5">
            Move your available commission to the payout account. Transfers are sent with Monnify.
          </p>

          <div className="rounded-xl bg-primary/[0.06] border border-primary/20 p-5 mb-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-secondary/50">Available now</div>
            <div className="font-display text-3xl font-bold text-secondary mt-1">{naira(available)}</div>
          </div>

          <button
            type="button"
            onClick={requestWithdraw}
            disabled={withdrawing || !accountActive || available <= 0}
            className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {withdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
            {!accountActive
              ? 'Confirm a payout account first'
              : available <= 0
                ? 'Nothing to withdraw yet'
                : `Withdraw ${naira(available)}`}
          </button>
          <Status msg={wMsg} />

          {finance?.withdrawals?.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-secondary/50 mb-2">
                Recent withdrawals
              </div>
              <div className="space-y-2">
                {finance.withdrawals.slice(0, 5).map((w) => (
                  <div
                    key={w._id}
                    className="flex items-center justify-between text-sm p-3 rounded-lg bg-secondary/[0.03] border border-secondary/10"
                  >
                    <span className="font-semibold text-secondary">{naira(w.amount)}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          w.status === 'paid'
                            ? 'text-green-700 bg-green-50'
                            : w.status === 'failed'
                              ? 'text-red-600 bg-red-50'
                              : 'text-amber-700 bg-amber-50'
                        }`}
                      >
                        {w.status}
                      </span>
                      <span className="text-secondary/40">{w.reference}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent earnings ──────────────────────────────────────────── */}
      {finance?.earnings?.length > 0 && (
        <div className="bg-white rounded-2xl border border-secondary/10 p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-secondary/50 mb-3">
            Recent commission credits
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-secondary/50 text-xs uppercase tracking-wide border-b border-secondary/10">
                  <th className="pb-2 pr-4">Talent</th>
                  <th className="pb-2 pr-4">Employer</th>
                  <th className="pb-2 pr-4">Base fee</th>
                  <th className="pb-2 pr-4">Commission (25%)</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {finance.earnings.slice(0, 10).map((e) => (
                  <tr key={e._id} className="border-b border-secondary/5">
                    <td className="py-3 pr-4 font-semibold text-secondary">
                      {e.seekerId?.name || 'Pool member'}
                    </td>
                    <td className="py-3 pr-4 text-secondary/60">{e.employerId?.name || '—'}</td>
                    <td className="py-3 pr-4 text-secondary/60">{naira(e.baseAmount)}</td>
                    <td className="py-3 pr-4 font-semibold text-primary">{naira(e.commissionAmount)}</td>
                    <td className="py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                          e.status === 'withdrawn' ? 'text-secondary/50 bg-secondary/10' : 'text-green-700 bg-green-50'
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
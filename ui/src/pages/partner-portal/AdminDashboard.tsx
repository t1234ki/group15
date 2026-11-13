import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    getOwnerApplications,
    isLaundryAdmin,
    reviewOwnerApplication,
    type OwnerApplication,
} from '../../services/ownerServices';
import styles from './onboarding.module.scss';

const AdminDashboard: React.FC = () => {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [applications, setApplications] = useState<OwnerApplication[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [reasons, setReasons] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

    const switchAccount = async () => {
        setIsSwitchingAccount(true);
        setError(null);
        try {
            await signOut();
            navigate('/signin', { replace: true, state: { from: '/admin' } });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not sign out this account.');
            setIsSwitchingAccount(false);
        }
    };

    const load = useCallback(async () => {
        const authorized = await isLaundryAdmin();
        setIsAdmin(authorized);
        if (!authorized) return;
        setApplications(await getOwnerApplications());
    }, []);

    useEffect(() => {
        let active = true;
        void load()
            .catch((cause: unknown) => {
                if (active)
                    setError(
                        cause instanceof Error ? cause.message : 'Could not load applications.'
                    );
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [load]);

    const review = async (application: OwnerApplication, approve: boolean) => {
        const reason = reasons[application.id]?.trim() ?? '';
        if (!approve && !reason) {
            setError('Enter a reason before rejecting an application.');
            return;
        }
        setBusyId(application.id);
        setError(null);
        setNotice(null);
        try {
            await reviewOwnerApplication(application.id, approve, reason);
            setNotice(
                `${application.businessName} application ${approve ? 'approved' : 'rejected'}.`
            );
            setApplications(await getOwnerApplications());
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not review this application.');
        } finally {
            setBusyId(null);
        }
    };

    if (isLoading)
        return (
            <main className={styles.page}>
                <p role="status">Loading admin dashboard...</p>
            </main>
        );
    if (isAdmin === false)
        return (
            <main className={styles.page}>
                <div className={styles.inner}>
                    <section className={`card ${styles.statusCard}`}>
                        <h1>Admin access required</h1>
                        <p>
                            The signed-in account ({user?.email || 'email unavailable'}) is not
                            being recognized as an administrator. The admin role is enabled for
                            admin@gmail.com. Sign out and sign in with that exact account.
                        </p>
                        {error && (
                            <p
                                className={styles.error}
                                role="alert"
                            >
                                {error}
                            </p>
                        )}
                        <button
                            className="button button--primary"
                            type="button"
                            onClick={() => void switchAccount()}
                            disabled={isSwitchingAccount}
                        >
                            {isSwitchingAccount ? 'Signing out...' : 'Sign out and switch account'}
                        </button>
                    </section>
                </div>
            </main>
        );

    return (
        <main className={styles.page}>
            <div className={styles.inner}>
                <header className={styles.pageHead}>
                    <p className={styles.eyebrow}>Administration</p>
                    <h1>Owner applications</h1>
                    <p>Review businesses requesting access to the SI MA ME marketplace.</p>
                </header>
                {error && (
                    <p
                        className={styles.error}
                        role="alert"
                    >
                        {error}
                    </p>
                )}
                {notice && (
                    <p
                        className={styles.success}
                        role="status"
                    >
                        {notice}
                    </p>
                )}
                {applications.length === 0 ? (
                    <section className={`card ${styles.statusCard}`}>
                        <p>No owner applications yet.</p>
                    </section>
                ) : (
                    <ul className={styles.applicationList}>
                        {applications.map((application) => (
                            <li
                                className={`card ${styles.applicationCard}`}
                                key={application.id}
                            >
                                <div className={styles.applicationHead}>
                                    <div>
                                        <p className={styles.eyebrow}>{application.status}</p>
                                        <h2>{application.businessName}</h2>
                                    </div>
                                    <time dateTime={application.createdAt}>
                                        {new Date(application.createdAt).toLocaleDateString()}
                                    </time>
                                </div>
                                {application.imageUrl && (
                                    <img
                                        className={styles.applicationImage}
                                        src={application.imageUrl}
                                        alt={`${application.businessName} laundry`}
                                    />
                                )}
                                <dl className={styles.details}>
                                    <div>
                                        <dt>Owner</dt>
                                        <dd>{application.ownerName}</dd>
                                    </div>
                                    <div>
                                        <dt>Email</dt>
                                        <dd>{application.ownerEmail}</dd>
                                    </div>
                                    <div>
                                        <dt>Phone</dt>
                                        <dd>{application.contactPhone}</dd>
                                    </div>
                                    <div>
                                        <dt>Location</dt>
                                        <dd>
                                            {[
                                                application.line1,
                                                application.line2,
                                                application.city,
                                                application.pincode,
                                            ]
                                                .filter(Boolean)
                                                .join(', ')}
                                            {application.latitude !== null &&
                                                application.longitude !== null && (
                                                    <>
                                                        <br />
                                                        <a
                                                            href={`https://www.google.com/maps?q=${application.latitude},${application.longitude}`}
                                                            target="_blank"
                                                            rel="noreferrer noopener"
                                                        >
                                                            View GPS pin
                                                        </a>
                                                    </>
                                                )}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>Services</dt>
                                        <dd>{application.services.join(', ')}</dd>
                                    </div>
                                </dl>
                                {application.about && <p>{application.about}</p>}
                                {application.status === 'pending' && (
                                    <div className={styles.reviewActions}>
                                        <label>
                                            Rejection reason (required to reject)
                                            <textarea
                                                maxLength={500}
                                                rows={2}
                                                value={reasons[application.id] ?? ''}
                                                onChange={(event) =>
                                                    setReasons((current) => ({
                                                        ...current,
                                                        [application.id]: event.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                        <div>
                                            <button
                                                className="button button--primary"
                                                type="button"
                                                disabled={busyId === application.id}
                                                onClick={() => void review(application, true)}
                                            >
                                                {busyId === application.id
                                                    ? 'Saving...'
                                                    : 'Approve'}
                                            </button>
                                            <button
                                                className="button button--secondary"
                                                type="button"
                                                disabled={busyId === application.id}
                                                onClick={() => void review(application, false)}
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {application.status === 'rejected' &&
                                    application.rejectionReason && (
                                        <p>
                                            <strong>Rejection reason:</strong>{' '}
                                            {application.rejectionReason}
                                        </p>
                                    )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </main>
    );
};

export default AdminDashboard;

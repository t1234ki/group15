import { HERO } from '../../config/homeConfig';
import { useLocationSearch } from '../../hooks/useLocationSearch';
import Icon from '../icons/Icon';
import styles from './hero.module.scss';

const Hero: React.FC = () => {
    const { error, isLocating, locate } = useLocationSearch();
    return (
        <section className={styles.hero}>
            <div className={styles.heroInner}>
                <div>
                    <p className={styles.heroBadge}>
                        <span
                            className={styles.heroBadgeDot}
                            aria-hidden="true"
                        />
                        {HERO.badge}
                    </p>

                    <h1 className={styles.heroTitle}>
                        {HERO.title.before}
                        <span className={styles.heroTitleAccent}>{HERO.title.accent}</span>
                        {HERO.title.after}
                    </h1>

                    <p className={styles.heroSubtitle}>{HERO.subtitle}</p>

                    <div
                        className={styles.heroSearch}
                    >
                        <div className={styles.heroField}>
                            <Icon
                                name="pin"
                                className={styles.heroFieldIcon}
                            />
                            <span>{HERO.search.label}</span>
                        </div>
                        <button
                            className="button button--primary button--lg"
                            type="button"
                            onClick={locate}
                            disabled={isLocating}
                        >
                            <Icon name="navigation" />
                            {isLocating ? HERO.search.locating : HERO.search.submit}
                        </button>
                        {error && (
                            <span
                                className={styles.heroSearchError}
                                role="alert"
                            >
                                {error}
                            </span>
                        )}
                    </div>

                    <ul className={styles.heroStats}>
                        {HERO.stats.map(({ icon, value, label }) => (
                            <li
                                key={label}
                                className={styles.heroStat}
                            >
                                <Icon
                                    name={icon}
                                    className={styles.heroStatIcon}
                                />
                                <strong>{value}</strong> {label}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className={styles.heroMedia}>
                    <img
                        className={styles.heroImage}
                        src={HERO.image.src}
                        alt={HERO.image.alt}
                        loading="eager"
                    />
                    <div className={styles.heroCard}>
                        <span
                            className={styles.heroCardIcon}
                            aria-hidden="true"
                        >
                            <Icon name={HERO.floatingCard.icon} />
                        </span>
                        <span>
                            <strong>{HERO.floatingCard.title}</strong>
                            <em>{HERO.floatingCard.detail}</em>
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Hero;

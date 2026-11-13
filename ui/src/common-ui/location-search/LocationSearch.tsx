import React from 'react';
import { PIN_SEARCH } from '../../config/cycleConfig';
import { useLocationSearch } from '../../hooks/useLocationSearch';
import Icon from '../icons/Icon';
import styles from './locationSearch.module.scss';

interface LocationSearchProps {
    className?: string;
}

/**
 * The page's one ask, made twice: once in the hero and once in the footer. Same
 * component, same behaviour, so the second ask is never a weaker version of the
 * first.
 */
const LocationSearch: React.FC<LocationSearchProps> = ({ className }) => {
    const { error, isLocating, locate } = useLocationSearch();

    return (
        <div
            className={[styles.search, className].filter(Boolean).join(' ')}
        >
            <button
                className={styles.searchSubmit}
                type="button"
                onClick={locate}
                disabled={isLocating}
            >
                <Icon name="navigation" />
                {isLocating ? PIN_SEARCH.locating : PIN_SEARCH.submit}
            </button>
            {error && (
                <span
                    className={styles.searchError}
                    role="alert"
                >
                    {error}
                </span>
            )}
        </div>
    );
};

export default LocationSearch;

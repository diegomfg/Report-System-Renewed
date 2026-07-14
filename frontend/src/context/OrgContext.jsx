import { createContext, useContext } from 'react';

const OrgContext = createContext(null);

export function OrgProvider({ orgId, orgName, role, refreshBadges, children }) {
    return (
        <OrgContext.Provider value={{ orgId, orgName, role, refreshBadges }}>
            {children}
        </OrgContext.Provider>
    );
}

export function useOrg() {
    return useContext(OrgContext);
}

import { createContext, useContext } from 'react';

const OrgContext = createContext(null);

export function OrgProvider({ orgId, orgName, role, children }) {
    return (
        <OrgContext.Provider value={{ orgId, orgName, role }}>
            {children}
        </OrgContext.Provider>
    );
}

export function useOrg() {
    return useContext(OrgContext);
}

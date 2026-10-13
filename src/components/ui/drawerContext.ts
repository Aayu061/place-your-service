import React from 'react';

export interface DrawerContextType {
  requestClose: () => void;
  isDirty: boolean;
}

export const DrawerContext = React.createContext<DrawerContextType>({
  requestClose: () => {},
  isDirty: false,
});

export const useDrawer = () => React.useContext(DrawerContext);

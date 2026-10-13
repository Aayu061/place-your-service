import React from 'react';

export interface ModalContextType {
  requestClose: () => void;
  isDirty: boolean;
}

export const ModalContext = React.createContext<ModalContextType>({
  requestClose: () => {},
  isDirty: false,
});

export const useModal = () => React.useContext(ModalContext);

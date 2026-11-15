import { useContext } from 'react';
import { RagContext, type RagContextType } from './ragContextInstance';

export const useRag = (): RagContextType => {
  const context = useContext(RagContext);
  if (!context) {
    throw new Error('useRag must be used within a RagProvider');
  }
  return context;
};

export default useRag;

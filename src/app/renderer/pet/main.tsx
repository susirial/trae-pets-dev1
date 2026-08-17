import React from 'react';
import { createRoot } from 'react-dom/client';
import { PetApp } from './PetApp';
import './pet.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <PetApp />
    </React.StrictMode>,
  );
}

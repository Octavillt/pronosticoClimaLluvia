import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../../src/App';

describe('App', () => {
  test('renderiza el encabezado principal', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'SistemaClima' })).toBeTruthy();
  });

  test('muestra la hora local', () => {
    render(<App />);
    expect(screen.getByText(/Hora local:/)).toBeTruthy();
  });
});

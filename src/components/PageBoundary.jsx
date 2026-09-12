import { Component } from 'react';

export class PageBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="alertBox actionAlert" role="alert">
          <strong>Não foi possível abrir este módulo.</strong>
          <span>Atualize a página para tentar novamente. Você também pode escolher outro esporte no menu.</span>
          <button type="button" onClick={() => window.location.reload()}>Atualizar página</button>
        </section>
      );
    }
    return this.props.children;
  }
}

```mermaid

graph LR
%% Conceptual Core
    Recursion((Recursion)) -> Abstraction((Abstraction))
    Recursion -> Efficiency((Efficiency))
    Recursion -> Structure((Compositional Structure))

    %% Cognitive Foundations
    Chomsky[Chomsky (1957): Linguistic recursion\n→ establishes recursion as hallmark of human language.] --> Recursion
    Pylyshyn[Pylyshyn (1980): Symbolic cognition\n→ frames recursion as a computational process of thought.] --> Recursion
    Tenenbaum[Tenenbaum (2011): Structured Bayesian reasoning\n→ shows how structured priors enable compositional abstraction.] --> Abstraction
    Marcus[Marcus (2017): Critique of deep learning\n→ warns against loss of symbolic, recursive reasoning.] --> Structure

    %% Neural and Computational Realizations
    Rumelhart[Rumelhart et al. (1986): Backpropagation\n→ recursion becomes dynamic state update within neural nets.] --> Recursion
    Hinton[Hinton (2006): Deep hierarchies\n→ introduces multi-layer abstraction, precursor to recursive representation.] --> Structure
    Bai[Bai et al. (2019): Deep Equilibrium Models\n→ proposes fixed-point recursion as inference mechanism.] --> Recursion
    Grathwohl[Grathwohl et al. (2019): FFJORD continuous recursion\n→ continuous-time recursion through differentiable dynamics.] --> Efficiency
    Zhai[Zhai et al. (2023): Compact emergent reasoning\n→ small models exhibit reasoning when recursively structured.] --> Efficiency

    %% Theoretical Reframings
    Chollet[Chollet (2019): Efficiency as intelligence\n→ defines intelligence as efficiency of skill acquisition.] --> Efficiency
    Schmidhuber[Schmidhuber (2015): Learning to Think\n→ formulates recursive meta-learning: thinking as self-iteration.] --> Recursion
    Mitchell[Mitchell (2023): Analogy & abstraction\n→ links reasoning to structural analogy rather than scale.] --> Abstraction
    Griffiths[Griffiths et al. (2023): Inductive biases\n→ identifies recursion as inductive bias for generalization.] --> Structure

    %% Contemporary Recursive Models
    Reflexion[Levine et al. (2024): Reflexive reasoning\n→ recursive verbal RL as self-improvement loop.] --> Recursion
    Liu[Liu et al. (2024): Self-discovering reasoning\n→ autonomous reasoning without explicit chain-of-thought.] --> Efficiency
    HRM[Wang et al. (2025): Hierarchical Reasoning Model\n→ dual-network recursion with adaptive halting; complex design.] --> Structure
    TRM[Jolicoeur-Martineau (2025): Tiny Recursive Model\n→ unifies efficiency, recursion, and abstraction in minimal form.] --> Recursion
    TRM --> Efficiency
    TRM --> Abstraction

    %% Philosophical Context
    vonSchulz[von Schulz (2024): Dialectical recursion in mind\n→ parallels recursive logic in human development and thought.] --> Abstraction
    Marcus --> Chollet
    Schmidhuber --> TRM

    %% Clusters
    subgraph Cognitive_Cluster[Cognitive and Philosophical Origins]
        Chomsky --> Pylyshyn --> Tenenbaum --> vonSchulz
    end

    subgraph Neural_Cluster[Neural and Computational Developments]
        Rumelhart --> Hinton --> Bai --> Grathwohl --> Zhai --> HRM --> TRM
    end

    subgraph Efficiency_Cluster[Minimalism and Efficiency Paradigm]
        Chollet --> Schmidhuber --> Liu --> TRM
    end

    subgraph Theoretical_Cluster[Abstraction and Inductive Bias]
        Marcus --> Mitchell --> Griffiths --> Tenenbaum --> TRM
    end

    %% Summary Notes
    note1[Note: Recursion evolves from linguistic recursion (Chomsky) → symbolic computation (Pylyshyn) → neural dynamics (Rumelhart, Bai) → efficiency-driven reasoning (TRM).]
    note2[Note: Efficiency and abstraction merge in TRM, representing a philosophical turn: intelligence as recursive compression, not scale.]

    %% Styling
    style TRM fill:#ffd580,stroke:#333,stroke-width:2px
    style Recursion fill:#b3d9ff,stroke:#333,stroke-width:2px
    style Efficiency fill:#b3ffd9,stroke:#333,stroke-width:2px
    style Abstraction fill:#f9c0c0,stroke:#333,stroke-width:2px
```
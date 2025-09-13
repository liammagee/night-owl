## Attention



As we've noted in the week's online guide, this week we are moving both back and forward - back to the earlier moments of consciousness, perception in particular, but also forward to the much more recent developments in both neuro and computer science.

What I propose this week is that we examine three key papers that all treat the concept of attention in a specific way. I won't be doing too much here to relate this concept to Hegel's unfolding architecture in *Phenomenology of Spirit* - we'll instead turn to that in the weeks ahead. But you may want to think how different meanings of attention might be situated with respect to both concepts of experience and recognition we've covered to date.

I'll start by looking at the Petersen & Posner [-@stevene.petersen2012theattention] paper, *The Attention System of the Human Brain: 20 Years After*, then the Vaswani et al's [-@ashishvaswani2017attentionis] *Attention is All You Need* paper, and then finally Terranova's [-@tizianaterranova2012attentioneconomy] critique of the Attention Economy. In each case we'll provide a short summary, and connect the argument to the wider lecture and course content - then provide time for discussion.

---

### Human Attention

This paper is an updated version of an earlier one in 1990, also by Posner and Petersen, at the beginning of "neuroimaging": using tomography, fMRI and EEG machines to monitor brain activity. They argue human attention involves three distinct but related cognitive processes: alterting, orienting and executive (or executive control). We might think of these as involving become aware of something; turning our attention towards that thing; and then making some decision about that thing: is it dangerous, attractive, and so on.

Alerting involves the initial registration of an external stimulus. They further distinguish two modes of alerting:  phasic, or short-term reactions, and tonic, os sustained vigilance. Both their initial and this updated paper located alerting function to the right hemisphere of the brain.

Orienting involves some kind of fast directing of attention in response to the stimulus or goal. This might be the instant turning of the head toward a large sound; or the fixation of the head and eyes on the road ahead while driving in difficult conditions. This happens in the frontal and posterior parts of the brain.

Finally, the executive function involves making decisions: to stay fixed upon an object that has gained attention, or to move on. Executive control is apparently located in several regions of the brain: the prefrontal cortex, the frontal midline region and lateral frontal cortex. In their revised article Petersen and Posner identify two distinct executive processes: one involving *sustained* focus or attention, another enabling a *switching* of tasks within the same overall attention frame or goal.

Within the context of learning, we can see how this new attention-oriented work helps to make sense of, in particular, learning *difficulties*. Impairments on different brain regions can result in complex but still localizable – and potentially addressable – limitations in how attention is alerted, directed, sustained and purposefully redirected, as conditions require. 

Now while this is not a course diving into neuroscientific research, we can note in passing that this kind of neurological or neuroscientific research has impacted upon the theory and practice of pedagogy. A quick Google Scholar search shows for example how many results have integrated "executive function" into pedagogy research:

![alt text](images/attention-pedagogy-studies.png)


These recent studies show, for example, that the hierarchy of attention mechanisms - from 


And of course GPT can help us 

![alt text](images/executive-models.png)


And to keep concordance with Hegel, we might also note his own strong distrust with the neuroscience of his day – a now outdated field called "phrenology", which involved measuring skulls to determinine cognitive aptitudess.

---

### Machine Attention

Vaswani et al.'s 2017 paper is a landmark in machine learning. Perhaps the most cited paper this century, this work by Google scholars was first actually implemented, not by Google, but by a young start-up company


---


### Synthesizing Human and Machine Attention?

When we return to the topic of consciousness next week, we'll see how some scholars, like Nancy Katherine-Hayles, have sought to combine neuroscience research into attention mechanisms with more traditional philosophical concerns about the nature of consciousness.  

---


### Thought Experiment

Let's start with the following thought experiment. We will imagine we have the following unfinished sentence, and we'll focus on the last word, `the`:

> The cat sat on <span style="color: red;">the</span>...


---

Now let's think about this from the machine's point of view. We saw from preceding discussion that this word `the` maintains a place in three lists of words or tokens:

- Query
- Key
- Value

We consider `the` as our *query* word, and we want to know what word should follow. We first compare it with every other word in the sentence, checking against their *key* values. This generates an initial set of probabilities, which I'll just use some example values:

```
the (Query) - The (Key): 0.05*
the (Query) - cat (Key): 0.15
the (Query) - sat (Key): 0.25
the (Query) - on (Key): 0.55

```

 * Because `the` rarely follows `the`!

What does this set of probabilities refer to? The relevance or how much the word `the` *attends* to the other tokens in the sentence. 


---

### From Attention to Context

Now each of these tokens – the, cat etc – also contains a set of numbers relating to their *values*. The values are – if you like – the semantic space of the word: the **cattiness** of the 'cat' (noun, animal, furry, etc); the **sittingness** of the 'sat' (verb, temporal, positional, etc); the **on-ness** of the 'on') (preposition, relational term); the **the-ness** of the 'the' (definite article, applies to nouns, connected to preposition). But also tied to the context of the current sentence.

So once we have a sense of relative attention – how the 'the' relates to other words in the sentence – we combine the values, the semantic representation, with these attention weights. 

This produces a **context**. To this we also add *positional* information:

```
The - 1
cat - 2
sat - 3
on - 4
the - 5
```

This is important because we are looking for the *6th* word, and the word `the` should have more influence on our prediction than 'cat' or 'sat'. 

---

### From Context to Prediction

Now this context is applied to every item in our initial vocabulary. That would include all the words we have used, plus (in a toy example), other nouns like 'mat', 'dog', 'house'. This produces a final set of probabilities:

```
the - 0.01
cat - 0.01
sat - 0.01
on - 0.01
mat - 0.80
dog - 0.08
house - 0.08
```

And finally: we roll a virtual die, and produce a prediction. In this toy example, 80 per cent of the time the predicted completion of the sentence will be 'mat'. 

Note that this 80% of the time - not 100% - is what makes LLMs 'probabilistic', 'stochastic' and 'non-deterministic'.

As a further note: You might also imagine all of this computation gets expensive for (a) large vocabularies (like multiple human languages) and (b) long contexts (like novels). That is true! And why companies like Nvidia and TSMC have such extreme valuations today - to train and do inference on attention-based mechanisms involves hardware investments in the order of tens or hundreds of billions of dollars today.

---

### What about human attention?

Let's do this as a rough experiment.

Start by *attending to* the following words I say:

```
The cat sat on the...
```

Now when I said:

> Start by *attending to* the following words I say:

You are *alerted*. You have to shift from an everyday state to an alerted one, maybe by the fact that I've issued an imperative: 'Start'.

What follows is your orientation to what actually does *follow* from the words 'the following words I say'. You are oriented towards the completion:

```
The cat sat on the...
```

But then you are also primed to the visual and audible *incompleteness*. The sentence doesn't end, instead your lecturer continues on with his exposition. The executive functions need to *decide*. What do you do? Do you:

1. Complete the sentence?
2. Keep listening to what I say?

Or both? Because this is a trivial case, you can complete the sentence very fast, and I'm not speaking too fast. Or do you *resist* the completion – ignoring my command altogether, or completing the sentence with another word? 

Think for a moment about this final activity. Is your completion different to the LLM? How much of this - pointing ahead to next week's topic – is conscious or unconscious? Do you, consciously or unconscously, draft a list of candidates, and pick the most likely? Is there a kind of metacognitive aspect that enables you to determine to sustain or switch your attention? Can you refuse to complete what you ought to - what your training suggests? 


---

### Make Content, Get Attention... Profit?

Turning now to Terranova's article, we come to the idea that attention is a kind of *commodity* and even *capital*, marked - like all commodities – by scarcity. It is an object that in itself warrants the *attention* of capital, of investors and advertisers, in the context of digital media. This is of course not new - the nephew of Sigmund Freud, Edmund Bernays, pioneered many uses of what was then, in the early/mid twentieth century, new media, such as radio, magazines, film and television. But with the maturation of computers, the Internet, smartphones, social media and, today, AI, we come to a point at which we see attention as corroded or "degraded" by information. There is so much information, in other worrds, that human attentive processes become saturated, barely able to keep up.

Terranova argues, citing Nicholas Carr, Catherine Malabou, Jonathon Crary and othres, that precisely the kind of neuroscientific research we discussed earlier makes possible a new corresponding *industrialization* of attention. By developing sophisticated techniques for securing attention (at alerting and orienting levels), it also seems as though the higher order "executive functions" are disrupted. In particular, the ability to "switch" is impaired - we find ourselves staring at the screen long past the point at which we intended to, when we initially and intentionally sought distraction. 


---

### Attention and Imitation 

![Image](images/pasted-image-2025-09-13T20-55-12-927Z-6998cdbe.png)


In a turn that also reminds us of our discussion of Hegel and the *social* process of learning, Terranova then discusses how attention to digital media in turn leads to another kind of by-passing of the deeper attention marked by executive function, due to social imitation. 

But this need not be entirely negative. Here Terranova turns to another Italian theorist, Lazzaratto, and his treatment of attention as the condition of social labour – and therefore a positive and productive force.

But Terranova's discussion takes a negative turn again, through the work of Bernard Stiegler. Stiegler – a French philosopher writing on technology since the 1990s – famously argued that contemporary technologies short-circuit important cognitive processes of memory and social processes of communication, resulting in, as Stiegler put it, a grave risk of "proletariatanization". Primal psychic and libidinal energy gets put to service, in this analysis, in the creation of value for companies that can direct our collective attention via "social technologies" and "new forms of social relations".

---

![Image](images/pasted-image-2025-09-13T21-05-34-066Z-650d5d77.png)

Collecting up both Lazzaratto and Stiegler's arguments, Terranova claims that – despite the very different valences or attitudes each brings to their analysis – both authors see attention as not simply a store of human attention that is only degraded by technologies. Rather, those technologies redirect attention, which in turn makes possible new kinds of subjects and social relations. For Lazzaratto, technology actually makes humans cooperate in ways that can resemble the internal structure of an individual brain. For Stiegler, technology is similarly integral to all human cognitive and social activity – but in its current form (the Internet, social media, and the general capitalization of attention and associated "libidinal" energies), it is tending toward the production of a simplified and even stupified society. 


---

![Image](images/pasted-image-2025-09-13T21-21-01-254Z-b87a061e.png)

The reason for including Terranova's analysis – aside from its wide-ranging survey of recent debates – is that in a certain sense it elaborates upon Hegel's insistence that self-consciousness and learning is essentially *social* in nature. Indeed both Lazzaratto and Stiegler's positions, which Terranova surveys, can be seen as extensions to Hegel's insight, though adjusted for the dramatic effects wrought by informatic technologies. 

The individual human subject is affected by what others say and do, and digital technologies act like a concentrating device of those social habits. Let's exaggerate: every tweet, post or Tiktok we read or watch acts like a small encounter between two self-consciousnesses, which must resolve itself into a micro-master / servant dialectic enounter. Do we like the content, do we stay engaged to it - are we in other words, a servant to it? Or do we criticize, disengage and ultimately walk away? Is our self-governance of our own attention a method also of self-mastery that resists servitude to others? 

And where does this then bring us with respect to a technology that arguably exceeds what Terranova, Lazzaratto and Stiegler could ever have anticipated in terms of its potential capture of human attention - precisely via application of its own "attention" mechanisms?
Hansen argues that as we enter the era of machine learning, platforms will increasingly predict,  and thereby control, even more fundamental processes than our attention: our conscious thinking itself.


[Over to Michele?]



---

According to many neuroscience, attention is seen as critical to the operations of consciousness. Next week we focus on this concept, bringing closer together Hegel's ideas on consciousness and self-consciousness and other theories. We will revisit attention, but also consider ideas of the "unconscious" – developed originally by Freud, but surprisingly relevant in the world of machine learning too – as well as  Nancy Katherine Hayles' work on what she terms "nonconscious cognition".



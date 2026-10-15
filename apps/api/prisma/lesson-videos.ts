/**
 * Lesson videos, one per lesson, chosen per topic and verified with YouTube's oEmbed endpoint
 * (exists, public, embedding allowed) on 2026-10-15. Title and channel are stored for
 * attribution. The seed only fills lessons that have no video, so admin choices are kept.
 * Re-verify with: npm run videos:check
 */
export interface LessonVideo {
  youtubeId: string;
  title: string;
  channel: string;
}

export const LESSON_VIDEOS: Record<string, Record<string, LessonVideo>> = {
  angular: {
    '1.1': {
      youtubeId: 'x5PZwb4XurU',
      title: 'Getting Started with Standalone Components in Angular',
      channel: 'Angular',
    },
    '1.2': {
      youtubeId: 'hC6Ke5xQIC4',
      title: 'How to use Angular Templating',
      channel: 'Code With Bubb',
    },
    '1.3': {
      youtubeId: 'KZ3_Pug9MmQ',
      title: 'Angular @Input & @Output Decorators Explained | Data Sharing Between Components (Beginner to Pro)',
      channel: 'codewithjana',
    },
    '2.1': {
      youtubeId: 'l0QlgYqwQZk',
      title: 'Angular 17 Tutorial - New Control Flow @if @for and @switch #6',
      channel: 'Programming with Umair',
    },
    '2.2': {
      youtubeId: '_gLiD0IgpoM',
      title: 'Angular Pipes Explained | Built-in Pipes in Angular (Beginner)',
      channel: 'Tutor Things',
    },
    '2.3': {
      youtubeId: 'uKLfLrrN6ZA',
      title: 'Angular Custom Pipe Tutorial | Build ExclamationPipe',
      channel: 'CodingForBeginners',
    },
    '3.1': {
      youtubeId: 'fXuYA1ajmDc',
      title: 'Angular for Beginners: Angular Services Tutorial',
      channel: 'Code Legends',
    },
    '3.2': {
      youtubeId: '_05v0mrNLh0',
      title: 'Angular HTTP Client Quick Start Tutorial',
      channel: 'Fireship',
    },
    '3.3': {
      youtubeId: 'Yo8OiajGprQ',
      title: 'Angular Functional HTTP Interceptors',
      channel: 'Arvind Rai (concretepage.com)',
    },
    '4.1': {
      youtubeId: 'qw4ShdkpfeA',
      title: 'The Hierarchy of Injectors in Angular (and Why You Should Care)',
      channel: 'Hrom Maksym',
    },
    '4.2': {
      youtubeId: 'mSlP7cIrkIs',
      title: 'Understanding Angular Providers | Class, Value, and Factory Providers',
      channel: 'Hrom Maksym',
    },
    '4.3': {
      youtubeId: 'K-hUBv2TZ0w',
      title: 'Simplifying Dependency Injection, Services, and Providers in Angular',
      channel: 'NomadCoder',
    },
    '4.4': {
      youtubeId: 'X_M4KKGF8p8',
      title: 'Angular InjectionToken Tutorial: From Basics to Advanced Usage',
      channel: 'Leela Web Dev',
    },
    '5.1': {
      youtubeId: 'UVDpCw4YvJM',
      title: 'Lazy loading standalone components in Angular',
      channel: 'nivek',
    },
    '5.2': {
      youtubeId: 'S-oYPntMGeU',
      title: 'Angular Functional Route Guards Explained',
      channel: 'Web Tech Talk ',
    },
    '5.3': {
      youtubeId: 'Nuwn5uY8ETw',
      title: 'Use @Input to Read Angular Route Parameters',
      channel: 'Deborah Kurata',
    },
    '6.1': {
      youtubeId: 'PPuCphAXiks',
      title: 'Master Angular Forms: FormGroup, FormControl, FormArray & More Explained',
      channel: 'JSgigs',
    },
    '6.2': {
      youtubeId: 'wwTURXicmuM',
      title: 'Learn Angular : Custom Validations in Reactive Forms',
      channel: 'CodeHandbook',
    },
    '6.3': {
      youtubeId: 'C3XE0MsmSoM',
      title: 'Create Dynamic Form Controls in Angular with FormArray',
      channel: 'Zoaib Khan',
    },
    '7.1': {
      youtubeId: '6W6gycuhiN0',
      title: 'Signals Unleashed: The Full Guide',
      channel: 'Rainer Hahnekamp',
    },
    '7.2': {
      youtubeId: 'xQIOWkBe5wQ',
      title: 'Using toSignal and toObservable for RxJS interop',
      channel: 'Deborah Kurata',
    },
    '7.3': {
      youtubeId: 'HXIOe3vmqWM',
      title: 'Angular Signals Shopping Cart Tutorial | Modern State Management',
      channel: 'BugArray',
    },
  },
  'angular-advanced': {
    '1.1': {
      youtubeId: 'wQCiE8040gg',
      title: 'Zone.js and NgZone in Angular | Run your code outside Angular',
      channel: 'Fun Of Heuristic',
    },
    '1.2': {
      youtubeId: 'Kba2joUhcpg',
      title: 'Change Detection, Immutability, OnPush Strategy in Angular (Tutorial)',
      channel: 'Agentic with Gourav',
    },
    '2.1': {
      youtubeId: 'EIF0g9LDHcQ',
      title: 'Rethinking reactivity with Angular Signals',
      channel: 'Angular',
    },
    '2.2': {
      youtubeId: 'R2wjayCaw30',
      title: 'Angular zoneless change detection',
      channel: 'academeez',
    },
    '3.1': {
      youtubeId: '7_SzJnZy_kg',
      title: 'Server-Side Rendering (SSR) & Hydration in Angular Explained',
      channel: 'Web Tech Talk ',
    },
    '3.2': {
      youtubeId: 'NNtmOIphSKA',
      title: 'Angular 17 Deferable Views (@defer) Explained | Complete Guide with Practical Examples',
      channel: 'procademy',
    },
  },
  'ai-engineering': {
    '1.1': {
      youtubeId: 'WMcwoIyK4DA',
      title: 'Large Language Models, Explained Briefly',
      channel: 'Computer History Museum',
    },
    '1.2': {
      youtubeId: 'rYxuEaTegd8',
      title: 'Understanding Context Windows and Tokens in LLMs',
      channel: 'Martin Brossman',
    },
    '2.1': {
      youtubeId: 'jlqgGkh1wzY',
      title: 'AWS re:Invent 2023 - Prompt engineering best practices for LLMs on Amazon Bedrock (AIM377)',
      channel: 'AWS Events',
    },
    '2.2': {
      youtubeId: 'CllLqPwCjD4',
      title: 'Getting Structured Output in JSON format',
      channel: 'Telusko',
    },
    '3.1': {
      youtubeId: 'UFW9wUotP1I',
      title: 'Vector Embeddings Explained in 20 Mins',
      channel: 'Pavan Belagatti',
    },
    '3.2': {
      youtubeId: 'nbJVJ1RPBEg',
      title: 'RAG Tutorial 2026 #5: Cosine Similarity for Vector Search Explained',
      channel: 'Harish Neel | AI',
    },
    '3.3': {
      youtubeId: 'Mvbc88IfAN8',
      title: 'Tutorial: Building a Semantic Text Search Application',
      channel: 'Zilliz',
    },
    '4.1': {
      youtubeId: 'd_CDfVIbODc',
      title: 'RAG Chunking Explained: Strategies, Chunk Size, Overlap, and Retrieval',
      channel: 'Schovia',
    },
    '4.2': {
      youtubeId: 'QTK55_Otbqs',
      title: 'RAG 101: Learn how to build your first pipeline!',
      channel: 'DataCamp',
    },
    '5.1': {
      youtubeId: 'NaCjm8rdxqk',
      title: 'Build Your First Eval: Creating a Custom LLM Evaluator with a Golden Dataset',
      channel: 'Arize AI',
    },
    '5.2': {
      youtubeId: 'vBJF2sy1Pyw',
      title: 'The challenges in using LLM-as-a-Judge - Sourabh Agrawal | Vector Space Talk #013',
      channel: 'Qdrant Vector Search',
    },
    '6.1': {
      youtubeId: 'qN_2fnOPY-M',
      title: 'Local Retrieval Augmented Generation (RAG) from Scratch (step by step tutorial)',
      channel: 'Daniel Bourke',
    },
  },
  'docker-essentials': {
    '1.1': {
      youtubeId: '1YzaS2GxGa4',
      title: 'What Is a Docker Container? Explained Simply for Beginners (vs Image)',
      channel: 'Super SQA | QA Automation',
    },
    '1.2': {
      youtubeId: 'zVUOiSAdM_c',
      title: 'Write Your First Dockerfile (Build a Custom Docker Image)',
      channel: 'Systems & Signals',
    },
    '2.1': {
      youtubeId: 'BTXfR76WmCw',
      title: 'Complete Docker Compose Tutorial (with Docker Networking)',
      channel: 'Monis Yousuf',
    },
    '2.2': {
      youtubeId: 'eNNwJ-xulBc',
      title: 'Docker Storage EXPLAINED! Volumes and Bind Mounts | Persistent Data in Docker | Docker Tutorial 6',
      channel: 'Pravanjan Rath',
    },
    '3.1': {
      youtubeId: 'cxcWdgo5XXo',
      title: 'Multi-Stage Docker Builds: Reduce Image Size & Improve Security!',
      channel: 'CodeLucky',
    },
    '3.2': {
      youtubeId: 'TyNGjP3PbLo',
      title: 'Docker Container Image Security: 13 Best Practices',
      channel: 'CyberJAR',
    },
  },
  'rxjs-in-depth': {
    '1.1': {
      youtubeId: 'xsOgPrbFckE',
      title: 'What Is an Observable?',
      channel: 'Deborah Kurata',
    },
    '1.2': {
      youtubeId: '5foQB5Qpock',
      title: 'RxJs Subject - Subject, BehaviorSubject, ReplaySubject, AsyncSubject',
      channel: 'The Code Captain',
    },
    '2.1': {
      youtubeId: 'qYdKmYp95Jg',
      title: 'RxJs switchMap vs mergeMap - Intro to Flattening Operators (2021)',
      channel: 'Decoded Frontend',
    },
    '2.2': {
      youtubeId: 'nh13_aPRQ0Q',
      title: 'RxJs Operators - ExhaustMap vs concatMap (2021)',
      channel: 'Decoded Frontend',
    },
    '3.1': {
      youtubeId: 'rlkCeeyBwf8',
      title: 'Marble testing with RxJS testing utils',
      channel: 'nivek',
    },
    '3.2': {
      youtubeId: 'cXHK0Hr4pIU',
      title: 'rxjs: marble testing',
      channel: 'TypeWithMe',
    },
  },
  'typescript-advanced': {
    '1.1': {
      youtubeId: 'G5syWAAIP3w',
      title: 'Typescript Tutorial #63 Introduction to generic constraints in TypeScript',
      channel: 'Technical Rajni',
    },
    '1.2': {
      youtubeId: 'xk_PbxR7G8A',
      title: 'Advanced TypeScript: Let’s Learn Generics!',
      channel: 'CodeTV',
    },
    '2.1': {
      youtubeId: 'QFWrbNehKk0',
      title: 'Conditional Types - Advanced TypeScript',
      channel: 'Dmytro Danylov',
    },
    '2.2': {
      youtubeId: 'RjQpep8fBdo',
      title: 'Mapped Types - Advanced TypeScript',
      channel: 'Dmytro Danylov',
    },
    '3.1': {
      youtubeId: 'TfEJ8s5vVek',
      title: "Fix the Fetch Type: Let's Add Auto-Completion and Perfect Type Safety to It in TypeScript",
      channel: 'Typed Rocks',
    },
  },
  'system-design': {
    '1.1': {
      youtubeId: 'AsJJGe5vxFM',
      title: 'System Design Basics: Back Of The Envelope Estimation',
      channel: 'MLWorks',
    },
    '1.2': {
      youtubeId: 'zbhrtO2gapY',
      title: 'Numbers All Programmers Should Know - System Design Tutorial',
      channel: 'Renaissance Engineer',
    },
    '2.1': {
      youtubeId: 'ruz-vK8IesE',
      title: 'SQL vs NoSQL Explained',
      channel: 'Be A Better Dev',
    },
    '2.2': {
      youtubeId: 'k1eyF7lEO1U',
      title: 'Database Indexing Explained | B-Tree, Hash, R-Tree, Inverted Index (with Examples)',
      channel: 'Kanhaiya Bhayana',
    },
    '3.1': {
      youtubeId: 'uq4kb7gLrPQ',
      title: 'Leader Follower Database Replication',
      channel: 'Irtiza Hafiz',
    },
    '3.2': {
      youtubeId: '8Seg-wCey9o',
      title: "Eventual Consistency: How It WORKS and Why It's IMPORTANT",
      channel: 'Marco Lenzo',
    },
    '4.1': {
      youtubeId: '5faMjKuB9bc',
      title: 'What is DATABASE SHARDING?',
      channel: 'Gaurav Sen',
    },
    '4.2': {
      youtubeId: 'vSIMWiDuBUc',
      title: 'Data partitioning: Hot-key problem',
      channel: 'A small bug',
    },
    '5.1': {
      youtubeId: 'oUJbuFMyBDk',
      title: 'What is a MESSAGE QUEUE and Where is it used?',
      channel: 'Gaurav Sen',
    },
    '5.2': {
      youtubeId: 'KlGxxVYdg-A',
      title: 'Kafka Delivery Guarantees: At-Most-Once vs. At-Least-Once Explained',
      channel: 'CodeOvation',
    },
    '6.1': {
      youtubeId: 'AMNWLz_f6qM',
      title: 'REST vs gRPC in Microservices | Which One Should You Use? (Explained Clearly)',
      channel: 'ByteMonk',
    },
    '6.2': {
      youtubeId: 'mdnlgzc8bLc',
      title: 'Rate Limiter Pattern Explained — Token Bucket, Sliding Window & More | Resilience Patterns',
      channel: 'Diary books',
    },
    '7.1': {
      youtubeId: '1iXzvxg_Keg',
      title: 'Cache Aside Pattern Explained | Fix Cache & Database Inconsistency',
      channel: 'SystemDR - Scalable System Design ',
    },
    '7.2': {
      youtubeId: 'oXiCPiWBRbw',
      title: 'Cache Invalidation Strategies Explained | Caching Fundamentals',
      channel: 'TheCodeAlchemist',
    },
    '7.3': {
      youtubeId: 'ulZRtmvWS3s',
      title: 'Design URL Shortener • System Design Interview Problem',
      channel: 'Anubhav Sethi',
    },
    '8.1': {
      youtubeId: 'vvhC64hQZMk',
      title: 'WHATSAPP System Design: Chat Messaging Systems for Interviews',
      channel: 'Gaurav Sen',
    },
    '8.2': {
      youtubeId: 'Qj4-GruzyDU',
      title: 'Design FB News Feed System Design Interview w/ ex: Meta Senior Manager',
      channel: 'Hello Interview',
    },
  },
  'german-a2': {
    '1.1': {
      youtubeId: 'EGbtoqZEdJY',
      title: 'How to introduce yourself in German - 7 Questions & Answers | A1 | sich vorstellen auf Deutsch',
      channel: 'Sprakuko - Deutsch lernen',
    },
    '1.2': {
      youtubeId: 's1--RwL88mM',
      title: 'How to say numbers and time in German',
      channel: 'Jannika Deutsch',
    },
    '2.1': {
      youtubeId: 'a_eTHyBbRjs',
      title: 'Learn the Nominative Case in German - Part 2: Possessive Articles - A1 [with Jenny]',
      channel: 'lingoni GERMAN',
    },
    '2.2': {
      youtubeId: 'rmS00c5DsY4',
      title: 'This is How you DESCRIBE PEOPLE in German (German Adjectives)',
      channel: 'Spring German - Learn German with Chunks',
    },
    '3.1': {
      youtubeId: 'LwK9KCqbSIU',
      title: 'Rooms in the House in German | Learn German Vocabulary with Examples | German for Beginners - A1',
      channel: 'lingoni GERMAN',
    },
    '3.2': {
      youtubeId: 'RPTnQyxzxMU',
      title: 'Two Way Prepositions in German | Wechselpräpositionen | Akkusativ/Dativ | A2 German Course |Lesson 2',
      channel: 'Germany 4Students',
    },
    '4.1': {
      youtubeId: 'ygM4fpq5440',
      title: 'Learn German - Vocabulary: Profession & Jobs',
      channel: 'Learn German with Pictures',
    },
    '4.2': {
      youtubeId: 'ajTTmEus63Q',
      title: 'Master German Modal Verbs! 🚀 dürfen, können, mögen & More Explained! 🇩🇪',
      channel: 'Deutsch lernen - Lesen & Hören',
    },
    '5.1': {
      youtubeId: 'edJn8_5xOYg',
      title: 'How to Talk About Your Weekend Plans in German!',
      channel: 'Sweet German Language',
    },
    '5.2': {
      youtubeId: '3m1TV_yh9gE',
      title: 'HABEN or SEIN for the Perfect Tense in German?',
      channel: 'MrsDeutsch',
    },
    '6.1': {
      youtubeId: 'up2hCZlIg2g',
      title: 'German Bakery Vocabulary and Conversational Phrases',
      channel: 'My Germanized Life',
    },
    '6.2': {
      youtubeId: 'gqAoZyDqNAk',
      title: "Simple conversation between doctor and patient in German - At the Doctor's - German dialogue",
      channel: 'Language Freak',
    },
    '6.3': {
      youtubeId: 'Jzpy9pnpz9k',
      title: 'Opening a Bank Account in German 🇩🇪 | Simple German Conversation for Beginners (A1)',
      channel: 'Guten Tag! — Learn German with Conversations',
    },
    '7.1': {
      youtubeId: 'bIk0iroJ3QQ',
      title: 'Tourist - Dialogue Hotel - Booking By Telephone - Phrases #25 - Learn German with Martha',
      channel: 'Dominique Clarier - Learn German',
    },
    '7.2': {
      youtubeId: 'dxUc4pTgQWI',
      title: 'A2 Goethe Exam Sprechen Teil 1: Top Tips & Sample Answers (2025)',
      channel: 'German with Pankila',
    },
  },
};

/* ═══════════════════════════════════════════════════════════════
   webcomics.js — Webcomic Series Data
   ───────────────────────────────────────────────────────────────
   ✏️  EDIT THIS FILE TO ADD / REMOVE / UPDATE WEBCOMICS.
   Both index.html and webcomic.html read from this file automatically.

   HOW TO ADD A NEW WEBCOMIC:
   1. Copy one { ... } block
   2. Paste it at the TOP of the array (newest first)
   3. Give it a unique id (e.g. "03", "04" ...)
   4. Fill in all fields
   5. Add comic episodes in the `episodes` array

   STRIP COLORS:
        Blue   → stripA:"#0284c7"  stripB:"#0ea5e9"
        Green  → stripA:"#059669"  stripB:"#10b981"
        Purple → stripA:"#7c3aed"  stripB:"#a855f7"
        Amber  → stripA:"#d97706"  stripB:"#f59e0b"
        Red    → stripA:"#dc2626"  stripB:"#f87171"
        Orange → stripA:"#ea580c"  stripB:"#fb923c"
        Pink   → stripA:"#db2777"  stripB:"#f472b6"
═══════════════════════════════════════════════════════════════ */

const WEBCOMICS = [

    {
        id:          "01",
        title:       "Earth Dead: Neel & Nexus-9",
        description: "পারমাণবিক যুদ্ধের আগুনে পৃথিবী আজ মৃত। ধ্বংস হয়ে গেছে মানবসভ্যতা। এই নিঃশব্দ ধ্বংসস্তূপে Dr. Neel এবং রহস্যময় AI NEXUS-9 শুরু করে মানব অস্তিত্ব টিকিয়ে রাখার শেষ যুদ্ধ।",
        author:      "Abdullah All Munan",
        status:      "Ongoing",
        genre:       "Sci-Fi",
        coverImage:  "10.png",
        stripA:      "#0284c7",
        stripB:      "#0ea5e9",
        episodes: [
        {
            episodeNum: 1,
            title:      "পৃথিবী মৃত",
            description:"নীরবতা এবং ধ্বংস",
            imageUrl:   "11.jpg",
            date:       "May 10, 2026",
            content:    "পারমাণবিক যুদ্ধের আগুনে পুরো মানবসভ্যতা কয়েক ঘণ্টার মধ্যে ধ্বংস হয়ে গেছে। শহরগুলো আর নেই, শুধু ভাঙা ধ্বংসস্তূপ পড়ে আছে। আকাশ এখন ধোঁয়া আর বিষে ভরা। সূর্যের আলো আর ঠিকভাবে পৌঁছায় না পৃথিবীতে।<br><br>মানুষ নেই, প্রাণ নেই, শব্দ নেই।<br>শুধু আছে নীরব ধ্বংস।<br><br>পানি বিষাক্ত, মাটি বিকিরণে ভরা, বাতাস মৃত্যু বহন করে।<br>পুরো গ্রহ এখন একটি মৃত দেহের মতো পড়ে আছে।"
            
            },
            {
                episodeNum: 2,
                title:      "বাঙ্কারের গভীরে",
                description: "একটি সিগন্যাল, একটি আশা, এবং অজানার দিকে একটি যাত্রা",
                imageUrl:   "12.jpg",
                date:       "May 12, 2026",
                content:    "ধ্বংস হয়ে যাওয়া পৃথিবীর নিচে, এক গভীর বাঙ্কারে এখনো টিকে আছে একটি পুরনো জীবন।<br><br>ঘরটা অন্ধকার। মাঝে মাঝে শুধু লাল জরুরি আলো জ্বলে ওঠে, আবার নিভে যায়।<br>পুরনো কন্ট্রোল রুমের স্ক্রিনগুলো ভেঙে গেছে, কিছুতে শুধু স্ট্যাটিক শব্দ।<br><br>Neel একা দাঁড়িয়ে আছে। তার মুখ এখনো দেখা যায় না।<br>শুধু নীরবতা।<br><br>হঠাৎ—<br>রেডিওতে অদ্ভুত একটি শব্দ আসে।<br><strong>\"...shhhhhh… signal… detected…\"</strong><br><br>স্ক্রিনে হঠাৎ করে একটি শক্তিশালী সিগন্যাল স্পাইক দেখা যায়।<br>একটি মানচিত্র ভেসে ওঠে।<br>অজানা একটি জায়গা চিহ্নিত।<br><br>স্ক্রিনে লেখা আসে—<br><strong>SURVIVOR SIGNAL</strong><br><br>Neel থেমে যায়।<br>তার শ্বাস ভারী হয়ে আসে।<br><br>এটা কি সত্যি কোনো মানুষ বেঁচে আছে?<br><br>তার হাত ধীরে ধীরে পুরনো যন্ত্রপাতির দিকে যায়।<br>সে প্রস্তুতি নিতে শুরু করে।<br>বাঙ্কারের ভারী দরজার সামনে দাঁড়ায়।<br>ধীরে ধীরে দরজাটি খুলতে শুরু করে…<br><br><em>ক্রিক… ক্রিক…</em><br><br>বাইরে শুধু অন্ধকার।<br><br><strong>দরজা অর্ধেক খোলা…</strong><br><br><strong>UNKNOWN CONTACT INITIATED</strong>"
            },
            {
                
                episodeNum: 3,
                title:      "বাঙ্কার-৭",
                description: "একটি মৃত বাঙ্কারের গভীরে একটি জীবন্ত শক্তি জেগে ওঠে",
                imageUrl:   "13.jpg",
                date:       "May 3, 2026",
                content:    "বাঙ্কার-৭ এর ভেতরটা যেন মৃত।<br><br>Neel ধীরে ধীরে অন্ধকার করিডোর দিয়ে এগিয়ে যায়।<br><br>প্রতিটি দেয়ালে জরুরি লাইট ঝিলমিল করছে… আবার নিভে যাচ্ছে।<br><br>চারপাশে পড়ে আছে মৃত বিজ্ঞানীদের দেহ।<br>পুরনো সাদা ল্যাব কোট, ধুলো জমে যাওয়া মুখ—সব কিছু সময়ের কাছে হেরে গেছে।<br><br>সে থেমে যায় না।<br><br>সে জানে—<em>কিছু একটা এখনো এখানে আছে।</em><br><br>একটি ভারী দরজার সামনে এসে দাঁড়ায় Neel।<br><br>উপরে লেখা—<br><br><strong>\"AI CORE ACCESS — LEVEL 7\"</strong><br><br>দরজা লক করা।<br><br>ভেতরে একটি টার্মিনাল স্ক্রিন জ্বলজ্বল করছে, কিন্তু পাসওয়ার্ড ছাড়া খোলা যাচ্ছে না।<br><br>Neel তার ডিভাইস বের করে।<br><br>সে সিস্টেম হ্যাক করতে শুরু করে।<br><br>কোডের পর কোড ভেঙে যায়।<br><br>হঠাৎ—<br><br>টার্মিনাল স্ক্রিনে লেখা আসে:<br><br><strong>\"ACCESS GRANTED\"</strong><br><br>এক মুহূর্তের জন্য পুরো বাঙ্কার কেঁপে ওঠে।<br><br>বিদ্যুৎ প্রবাহ বেড়ে যায়।<br><br>AI core chamber চালু হচ্ছে।<br><br>হঠাৎ বিশাল শক্তি পুরো রুমে ছড়িয়ে পড়ে।<br><br>অন্ধকারের ভেতর থেকে একটি আলো জন্ম নেয়।<br><br>একটি চোখ…<br><br><strong>ডিজিটাল… নীল আলোতে জ্বলছে।</strong><br><br>Neel স্তব্ধ হয়ে যায়।<br><br>সেই চোখ তাকে দেখছে।<br><br>স্ক্রিনে লেখা ভেসে ওঠে—<br><br><strong>\"INITIALIZING…\"</strong>"
            },
            {
                episodeNum: 4,
                title:      "Coming soon",
                description: "This episode is coming soon.",
                imageUrl:   "10.png",
                date:       "",
                content:    ""
            },
            {
                episodeNum: 5,
                title:      "Coming soon",
                description: "This episode is coming soon.",
                imageUrl:   "10.png",
                date:       "",
                content:    ""
            },
            {
                episodeNum: 6,
                title:      "Coming soon",
                description: "This episode is coming soon.",
                imageUrl:   "10.png",
                date:       "",
                content:    ""
            },
            {
                episodeNum: 7,
                title:      "Coming soon",
                description: "This episode is coming soon.",
                imageUrl:   "10.png",
                date:       "",
                content:    ""
            },
            {
                episodeNum: 8,
                title:      "Coming soon",
                description: "This episode is coming soon.",
                imageUrl:   "10.png",
                date:       "",
                content:    ""
            }
        ]
    },

    
]; // ← DO NOT DELETE THIS LINE

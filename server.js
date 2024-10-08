const express = require('express');
const expressHandlebars = require('express-handlebars');
const passport = require('passport');
const session = require('express-session');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const { createCanvas } = require('canvas');
const crypto = require('crypto'); // Add this line to import the crypto module
const dotenv = require('dotenv');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { format } = require('date-fns'); // Add this line to import date-fns
const Handlebars = require('handlebars')

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const app = express();
const PORT = 3000;

dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Configure passport
passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

const dbFileName = 'microblog.db';
let db;

async function initializeDB() {
    db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
    console.log('Database connected.');
}

app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            includes: function (array, value, options) {
                if (array && array.includes(value)) {
                    return options.fn ? options.fn(this) : true;
                }
                return options.inverse ? options.inverse(this) : false;
            },
            formatTimestamp: timestamp => {
                return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss');
            }
        },
    })
);

Handlebars.registerHelper('split', function (context, delimiter) {
    return context.split(delimiter);
});

app.set('view engine', 'handlebars');
app.set('views', './views');

app.use(
    session({
        secret: 'oneringtorulethemall',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
    })
);

app.use((req, res, next) => {
    res.locals.appName = 'blog.js';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.user = getCurrentUser(req) || {};
    next();
});

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    async (req, res) => {
        const googleId = req.user.id;
        const hashedGoogleId = crypto.createHash('sha256').update(googleId).digest('hex');
        req.session.hashedGoogleId = hashedGoogleId;

        try {
            let localUser = await findUserByHashedGoogleId(hashedGoogleId);
            if (localUser) {
                req.session.userId = localUser.id;
                req.session.loggedIn = true;
                res.redirect('/');
            } else {
                res.redirect('/registerUsername');

            }
        }
        catch (err) {
            console.error('Error finding user:', err);
            res.redirect('/error');
        }
});

app.get('/registerUsername', (req, res) => {
    res.render('registerUsername', { regError: req.query.error });
});



app.get('/sortPosts', async (req, res) => {
    const sortBy = req.query.sortBy || 'recency';
    const posts = await getPosts(sortBy);
    const user = await getCurrentUser(req) || {};

    const html = posts.map(post => {
        const commentsHtml = post.comments.map(comment => `
            <div class="comment">
                <p><strong>${comment.username}</strong> commented on <em>${format(new Date(comment.timestamp), 'yyyy-MM-dd HH:mm:ss')}</em></p>
                <p>${comment.content}</p>
            </div>
        `).join('');

        const tagHtml = post.tag ? `
            <span class="tag">${post.tag}</span>
        ` : `
            <span class="tag">no tag</span>
        `;

        return `
            <div class="post">
                <div class="post-avatar">
                    <img src="${post.avatar_url ? post.avatar_url : '/avatar/' + post.username}" alt="${post.username}'s avatar">
                </div>
                <div class="post-content preserve-newlines">
                    <h2>${post.title}</h2>
                    <p>${post.content}</p>
                    <p>Posted by <strong>${post.username}</strong> on <em>${format(new Date(post.timestamp), 'yyyy-MM-dd HH:mm:ss')}</em></p>
                    <p>Tags: ${tagHtml}</p>
                    <div class="post-status-bar">
                        <button data-id="${post.id}" class="like-button" onclick="handleLikeClick(event)">
                            <i class="fas fa-heart"></i>
                            <span class="likes-count">${post.likes}</span>
                        </button>
                        ${user.username === post.username ? `
                        <button data-id="${post.id}" class="delete-button" onclick="handleDeleteClick(event)">
                            <i class="fas fa-trash-alt"></i>
                        </button>` : ''}
                    </div>
                    <div class="comments-section">
                        ${commentsHtml}
                    </div>
                    <div class="comment-form">
                        <form action="/comment" method="post">
                            <input type="hidden" name="post_id" value="${post.id}">
                            <textarea name="content" placeholder="Write a comment..." required></textarea>
                            <button type="submit">Comment</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    res.json({ html, posts }); // Return the posts data as well
});





// Route to fetch sorted posts
app.get('/sortPosts', async (req, res) => {
    const sortBy = req.query.sortBy || 'recency';
    const posts = await getPosts(sortBy);
    const user = await getCurrentUser(req) || {};

    const html = posts.map(post => {
        const commentsHtml = post.comments.map(comment => `
            <div class="comment">
                <p><strong>${comment.username}</strong> commented on <em>${format(new Date(comment.timestamp), 'yyyy-MM-dd HH:mm:ss')}</em></p>
                <p>${comment.content}</p>
            </div>
        `).join('');

        const tagHtml = post.tag ? `
            <span class="tag">${post.tag}</span>
        ` : `
            <span class="tag">no tag</span>
        `;

        return `
            <div class="post">
                <div class="post-avatar">
                    <img src="${post.avatar_url ? post.avatar_url : '/avatar/' + post.username}" alt="${post.username}'s avatar">
                </div>
                <div class="post-content preserve-newlines">
                    <h2>${post.title}</h2>
                    <p>${post.content}</p>
                    <p>Posted by <strong>${post.username}</strong> on <em>${format(new Date(post.timestamp), 'yyyy-MM-dd HH:mm:ss')}</em></p>
                    <p>Tags: ${tagHtml}</p>
                    <div class="post-status-bar">
                        <button data-id="${post.id}" class="like-button" onclick="handleLikeClick(event)">
                            <i class="fas fa-heart"></i>
                            <span class="likes-count">${post.likes}</span>
                        </button>
                        ${user.username === post.username ? `
                        <button data-id="${post.id}" class="delete-button" onclick="handleDeleteClick(event)">
                            <i class="fas fa-trash-alt"></i>
                        </button>` : ''}
                    </div>
                    <div class="comments-section">
                        ${commentsHtml}
                    </div>
                    <div class="comment-form">
                        <form action="/comment" method="post">
                            <input type="hidden" name="post_id" value="${post.id}">
                            <textarea name="content" placeholder="Write a comment..." required></textarea>
                            <button type="submit">Comment</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    res.json({ html, posts, postsHtml: html }); 
});


app.get('/', async (req, res) => {
    const posts = await getPosts();
    const user = await getCurrentUser(req) || {};
    res.render('home', { posts, user });
});

app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

app.get('/error', (req, res) => {
    res.render('error');
});

app.get('/post/:id', async (req, res) => {
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (post) {
        res.render('post', { post });
    } else {
        res.redirect('/error');
    }
});

app.post('/posts', async (req, res) => {
    const { title, content, tag } = req.body; 
    const user = await getCurrentUser(req);
    if (user) {
        await addPost(title, content, user, tag);
        res.redirect('/');
    } else {
        res.redirect('/login');
    }
});

app.post('/like/:id', isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id);
    const user = await getCurrentUser(req);

    const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
    if (post && user && post.username !== user.username) {
        const likedBy = JSON.parse(post.likedBy || '[]');
        let liked = false;
        if (likedBy.includes(user.username)) {
            likedBy.splice(likedBy.indexOf(user.username), 1);
            await db.run('UPDATE posts SET likes = likes - 1, likedBy = ? WHERE id = ?', [
                JSON.stringify(likedBy),
                postId
            ]);
        } else {
            likedBy.push(user.username);
            await db.run('UPDATE posts SET likes = likes + 1, likedBy = ? WHERE id = ?', [
                JSON.stringify(likedBy),
                postId
            ]);
            liked = true;
        }
        const updatedPost = await db.get('SELECT likes FROM posts WHERE id = ?', [postId]);
        res.json({ success: true, likes: updatedPost.likes, liked });
    } else {
        res.json({ success: false, message: 'Unauthorized or post not found' });
    }
});

app.get('/', async (req, res) => {
    const posts = await getPosts();
    const user = await getCurrentUser(req) || {};
    res.render('home', { posts, user });
});


app.post('/comment', async (req, res) => {
    const { post_id, content } = req.body;
    const user = await getCurrentUser(req);
    if (user) {
        await db.run(
            'INSERT INTO comments (post_id, username, content, timestamp) VALUES (?, ?, ?, ?)',
            [post_id, user.username, content, new Date().toISOString()]
        );

        const referer = req.header('Referer') || '/';
        
        if (referer.includes('/profile')) {
            res.redirect('/profile');
        } else {
            res.redirect('/');
        }
    } else {
        res.redirect('/login');
    }
});


app.get('/profile', isAuthenticated, async (req, res) => {
    await renderProfile(req, res);
});

app.get('/avatar/:username', (req, res) => {
    handleAvatar(req, res);
});

app.post('/register', async (req, res) => {
    await registerUser(req, res);
});

app.post('/registerUsername', async (req, res) => {
    await registerUser(req, res);
});

app.post('/login', async (req, res) => {
    await loginUser(req, res);
});

app.get('/logout', (req, res) => {
    logoutUser(req, res);
});

app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
});

app.post('/delete/:id', isAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id);
    const user = await getCurrentUser(req);
    const post = await db.get('SELECT * FROM posts WHERE id = ? AND username = ?', [postId, user.username]);
    if (post) {
        await db.run('DELETE FROM posts WHERE id = ?', [postId]);
        res.redirect('/');
    } else {
        res.redirect('/error');
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, async () => {
    await initializeDB();
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

async function getCurrentUser(req) {
    if (!req.session.userId) return null;
    return await db.get('SELECT * FROM users WHERE id = ?', [req.session.userId]);
}

async function getPosts(sortBy = 'recency') {
    let query = 'SELECT * FROM posts';
    if (sortBy === 'likes') {
        query += ' ORDER BY likes DESC';
    } else {
        query += ' ORDER BY timestamp DESC';
    }
    const posts = await db.all(query);

    // Fetch comments for each post
    for (const post of posts) {
        const comments = await db.all('SELECT * FROM comments WHERE post_id = ? ORDER BY timestamp DESC', [post.id]);
        post.comments = comments;

        post.tags = post.tags ? post.tags.split(',') : [];
    }
    
    return posts;
}

async function addPost(title, content, user, tag) {
    await db.run(
        'INSERT INTO posts (title, content, username, timestamp, likes, tag) VALUES (?, ?, ?, ?, ?, ?)', 
        [title, content, user.username, new Date().toISOString(), 0, tag || null]
    );
}

async function updatePostLikes(req, res) {
    const postId = parseInt(req.params.id);
    const user = await getCurrentUser(req);
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
    if (post && user && post.username !== user.username) {
        const likedBy = JSON.parse(post.likedBy || '[]');
        let liked = false;
        if (likedBy.includes(user.username)) {
            likedBy.splice(likedBy.indexOf(user.username), 1);
            await db.run('UPDATE posts SET likes = likes - 1, likedBy = ? WHERE id = ?', [
                JSON.stringify(likedBy),
                postId
            ]);
        } else {
            likedBy.push(user.username);
            await db.run('UPDATE posts SET likes = likes + 1, likedBy = ? WHERE id = ?', [
                JSON.stringify(likedBy),
                postId
            ]);
            liked = true;
        }
        const updatedPost = await db.get('SELECT likes FROM posts WHERE id = ?', [postId]);
        res.json({ success: true, likes: updatedPost.likes, liked });
    } else {
        res.json({ success: false });
    }
}


async function renderProfile(req, res) {
    const user = await getCurrentUser(req);
    
    const userPosts = await db.all('SELECT * FROM posts WHERE username = ? ORDER BY timestamp DESC', [user.username]);
    
    for (let post of userPosts) {
        const comments = await db.all('SELECT * FROM comments WHERE post_id = ? ORDER BY timestamp ASC', [post.id]);
        post.comments = comments;
        post.tags = post.tags ? post.tags.split(',') : [];
    }
    
    res.render('profile', { user, posts: userPosts });
}


function handleAvatar(req, res) {
    const { username } = req.params;
    const user = findUserByUsername(username);
    if (user) {
        const letter = username.charAt(0).toUpperCase();
        const avatar = generateAvatar(letter);
        res.setHeader('Content-Type', 'image/png');
        res.send(avatar);
    } else {
        res.redirect('/error');
    }
}

async function findUserByUsername(username) {
    return await db.get('SELECT * FROM users WHERE username = ?', [username]);
}

async function findUserById(userId) {
    return await db.get('SELECT * FROM users WHERE id = ?', [userId]);
}

function generateAvatar(letter, width = 100, height = 100) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const backgroundColor = '#F333FF';

    // Draw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw letter
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${width / 2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, width / 2, height / 2);

    return canvas.toBuffer();
}

function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

async function registerUser(req, res) {
    const { username } = req.body;

    hashedGoogleId = req.session.hashedGoogleId;

    const existingUser = await db.get('SELECT * FROM users WHERE username = ? OR hashedGoogleId = ?', [username, hashedGoogleId]);
    if (existingUser) {
        res.redirect('/register?error=Username%20or%20hashedGoogleId%20already%20taken');
    } else {
        const result = await db.run(
            'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
            [username, hashedGoogleId, '', new Date().toISOString()]
        );
        req.session.userId = result.lastID;
        req.session.loggedIn = true;
        res.redirect('/');
    }
}

async function loginUser(req, res) {
    const { username } = req.body;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (user) {
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.redirect('/login?error=Invalid%20username');
    }
}

function logoutUser(req, res) {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/error');
        }
        res.redirect('/googleLogout');
    });
}

async function findUserByHashedGoogleId(hashedGoogleId) {
    try {
        const currUser = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [hashedGoogleId]);
        return currUser; 
    } catch (err) {
        throw err;
    }
}

async function getPosts(sortBy = 'recency') {
    let query = 'SELECT * FROM posts';
    if (sortBy === 'likes') {
        query += ' ORDER BY likes DESC';
    } else {
        query += ' ORDER BY timestamp DESC';
    }
    const posts = await db.all(query);

    for (const post of posts) {
        const comments = await db.all('SELECT * FROM comments WHERE post_id = ? ORDER BY timestamp DESC', [post.id]);
        post.comments = comments;

        post.tag = post.tag || 'no tag';
    }
    
    return posts;
}



initializeDB().catch(err => {
    console.error('Error initializing database:', err);
});
